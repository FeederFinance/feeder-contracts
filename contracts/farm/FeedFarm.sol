// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../token/FeedToken.sol";

contract FeedFarm is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of FEEDs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accFeedPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accFeedPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }
    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. FEEDs to distribute per block.
        uint256 lastRewardBlock; // Last block number that FEEDs distribution occurs.
        uint256 accFeedPerShare; // Accumulated FEEDs per share, times 1e12. See below.
        uint16 exitFeeBP; // Exit fee in basis points.
    }
    // The FEED TOKEN!
    FeedToken public feed;
    // Dev address.
    address public devAddr;
    // Insurance fund address.
    address public insAddr;
    // Fee collector address.
    address public feeAddr;
    // FEED tokens created per block.
    uint256 public feedPerBlock;
    // Reduction interval
    uint256 public reductionInterval;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // Referral Bonus in basis points. Initially set to 2%
    uint256 public refBonusBP = 200;
    // The block number when FEED mining starts.
    uint256 public startBlock;
    // Max Exit Fee: 10%.
    uint16 public constant MAXIMUM_EXIT_FEE_BP = 1000;
    // Max referral commission rate: 10%.
    uint16 public constant MAXIMUM_REFERRAL_BP = 1000;
    // Referral Mapping
    mapping(address => address) public referrers; // account_address -> referrer_address
    mapping(address => uint256) public referredCount; // referrer_address -> num_of_referred
    // Pool Exists Mapper
    mapping(IERC20 => bool) public poolExistence;
    // Pool ID Tracker Mapper
    mapping(IERC20 => uint256) public poolIdForLpAddress;
    // Last reduction block
    uint256 public lastReductionBlock = 0;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Referral(address indexed _referrer, address indexed _user);
    event ReferralPaid(address indexed _user, address indexed _userTo, uint256 _reward);
    event ReferralBonusBpChanged(uint256 _oldBp, uint256 _newBp);
    event EmissionRateUpdated(address indexed caller, uint256 previousAmount, uint256 newAmount);

    constructor(
        FeedToken _feed,
        address _devaddr,
        address _insAddr,
        address _feeAddr,
        uint256 _feedPerBlock,
        uint256 _startBlock,
        uint256 _reductionInterval
    ) public {
        feed = _feed;
        devAddr = _devaddr;
        insAddr = _insAddr;
        feeAddr = _feeAddr;
        feedPerBlock = _feedPerBlock;
        startBlock = _startBlock;
        reductionInterval = _reductionInterval;
    }

    // Get number of pools added.
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Get Pool ID by Token
    function getPoolIdForLpToken(IERC20 _lpToken) external view returns (uint256) {
        require(poolExistence[_lpToken] != false, "Farm: Token does not exists in any pool");
        return poolIdForLpAddress[_lpToken];
    }

    // Modifier to check Duplicate pools
    modifier nonDuplicated(IERC20 _lpToken) {
        require(poolExistence[_lpToken] == false, "Farm: Duplicated pool");
        _;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC20 _lpToken,
        uint16 _exitFeeBP,
        bool _withUpdate
    ) public onlyOwner nonDuplicated(_lpToken) {
        require(_exitFeeBP <= MAXIMUM_EXIT_FEE_BP, "Farm(add): invalid exit fee basis points");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolExistence[_lpToken] = true;
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accFeedPerShare: 0,
                exitFeeBP: _exitFeeBP
            })
        );
        poolIdForLpAddress[_lpToken] = poolInfo.length - 1;
    }

    // Update the given pool's FEED allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        uint16 _exitFeeBP,
        bool _withUpdate
    ) public onlyOwner {
        require(_exitFeeBP <= MAXIMUM_EXIT_FEE_BP, "Farm(set): invalid exit fee basis points");
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].exitFeeBP = _exitFeeBP;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from);
    }

    // View function to see pending FEEDs on frontend.
    function pendingFeed(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accFeedPerShare = pool.accFeedPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 feedReward = multiplier.mul(feedPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accFeedPerShare = accFeedPerShare.add(feedReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accFeedPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 feedTotalCap = feed.cap();
        uint256 feedTotalSupply = feed.totalSupply();
        uint256 remainingFeed = feedTotalCap.sub(feedTotalSupply);
        uint256 feedReward = multiplier.mul(feedPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        if (remainingFeed < feedReward) {
            feedReward = remainingFeed;
        }
        uint256 devReward = feedReward.div(20); // 5% Feed to Dev Fund
        uint256 insReward = feedReward.div(50); // 2% Feed to Insurance Fund
        uint256 userReward = feedReward.sub(devReward).sub(insReward);
        feed.mintTo(address(this), userReward);
        feed.mintTo(devAddr, devReward);
        feed.mintTo(insAddr, insReward);
        pool.accFeedPerShare = pool.accFeedPerShare.add(userReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to FeedFarm for FEED allocation.
    function deposit(
        uint256 _pid,
        uint256 _amount,
        address _referrer
    ) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accFeedPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                payReferralCommission(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            setReferral(msg.sender, _referrer);
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accFeedPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from FeedFarm.
    function withdraw(uint256 _pid, uint256 _amount) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "Farm: Withdraw amount is larger than available balance");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accFeedPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            payReferralCommission(msg.sender, pending);
        }
        if (_amount > 0) {
            if (pool.exitFeeBP > 0) {
                uint256 exitFee = _amount.mul(pool.exitFeeBP).div(10000);
                user.amount = user.amount.sub(_amount);
                pool.lpToken.safeTransfer(address(msg.sender), _amount.sub(exitFee));
                pool.lpToken.safeTransfer(feeAddr, exitFee);
            } else {
                user.amount = user.amount.sub(_amount);
                pool.lpToken.safeTransfer(address(msg.sender), _amount);
            }
        }
        user.rewardDebt = user.amount.mul(pool.accFeedPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe feed transfer function, just in case if rounding error causes pool to not have enough FEEDs.
    function safeFeedTransfer(address _to, uint256 _amount) internal {
        uint256 feedBal = feed.balanceOf(address(this));
        if (_amount > feedBal) {
            feed.transfer(_to, feedBal);
        } else {
            feed.transfer(_to, _amount);
        }
    }

    // Update dev address by the previous dev
    function changeDevAddr(address _devAddr) public {
        require(msg.sender == devAddr, "Farm: Only dev can change dev address");
        devAddr = _devAddr;
    }

    // Update insurance address by previous insurer
    function changeInsAddr(address _insAddr) public {
        require(msg.sender == insAddr, "Farm: Only insurer can change insurance address");
        insAddr = _insAddr;
    }

    // Update fees collector address by previous fees collector
    function changeFeeAddr(address _feeAddr) public {
        require(msg.sender == feeAddr, "Farm: Only fee collector can change fee collector address");
        feeAddr = _feeAddr;
    }

    // Update to emission rate (feedPerBlock)
    function updateEmissionRate(uint256 newEmissionRate) public onlyOwner {
        require(block.number > startBlock, "Farm: Emission rate can only update after mining starts");
        require(block.number >= lastReductionBlock.add(reductionInterval), "Farm: Emission rate in reduction interval");
        massUpdatePools();
        lastReductionBlock = block.number;
        uint256 previousEmissionRate = feedPerBlock;
        feedPerBlock = newEmissionRate;
        emit EmissionRateUpdated(msg.sender, previousEmissionRate, newEmissionRate);
    }

    // Set Referral Address for a user
    function setReferral(address _user, address _referrer) internal {
        if (_referrer == address(_referrer) && referrers[_user] == address(0) && _referrer != address(0) && _referrer != _user) {
            referrers[_user] = _referrer;
            referredCount[_referrer] += 1;
            emit Referral(_user, _referrer);
        }
    }

    // Get Referral Address for a Account
    function getReferral(address _user) public view returns (address) {
        return referrers[_user];
    }

    // Pay referral commission to the referrer who referred this user.
    function payReferralCommission(address _user, uint256 _pending) internal {
        address referrer = getReferral(_user);
        if (referrer != address(0) && referrer != _user && refBonusBP > 0) {
            uint256 refBonusEarned = _pending.mul(refBonusBP).div(10000);
            safeFeedTransfer(referrer, refBonusEarned);
            safeFeedTransfer(_user, _pending.sub(refBonusEarned));
            emit ReferralPaid(_user, referrer, refBonusEarned);
        } else {
            safeFeedTransfer(_user, _pending);
        }
    }

    // Referral Bonus in basis points.
    // Initially set to 2%, this this the ability to increase or decrease the Bonus percentage based on
    // community voting and feedback.
    function updateReferralBonusBp(uint256 _newRefBonusBp) public onlyOwner {
        require(_newRefBonusBp <= MAXIMUM_REFERRAL_BP, "Farm: Referral bonus has reached maxmimum threshold");
        require(_newRefBonusBp != refBonusBP, "Farm: Referral bonus is the same");
        uint256 previousRefBonusBP = refBonusBP;
        refBonusBP = _newRefBonusBp;
        emit ReferralBonusBpChanged(previousRefBonusBP, _newRefBonusBp);
    }
}
