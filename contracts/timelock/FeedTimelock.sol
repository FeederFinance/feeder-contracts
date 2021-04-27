// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.8.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract FeedTimelock {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    using Address for address;

    // Timelock administrator.
    address private admin;

    // ERC20 token that will be locked.
    IERC20 private _token;

    // Beneficiary of tokens after they released.
    address private _beneficiary;

    // Start block of timelock.
    uint256 private _startBlock;

    // Release block interval
    uint256 private _releaseInterval;

    // Release token amount
    uint256 private _releaseAmount;

    // Minimum locked amount of tokens
    uint256 private _minLockAmount;

    // Emitted when admin is changed.
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when token is changed.
    event NewToken(address oldToken, address newToken);

    /// @notice Emitted when beneficiary is changed.
    event NewBeneficiary(address oldBeneficiary, address newBeneficiary);

    /// @notice Emitted when release interval is changed
    event NewReleaseInterval(uint256 oldReleaseInterval, uint256 newReleaseInterval);

    /// @notice Emitted when release amount is changed
    event NewReleaseAmount(uint256 oldReleaseAmount, uint256 newReleaseAmount);

    constructor(
        IERC20 token_,
        address beneficiary_,
        uint256 releaseInterval_,
        uint256 releaseAmount_,
        uint256 minLockAmount_
    ) public {
        admin = msg.sender;

        _token = token_;
        _beneficiary = beneficiary_;
        _releaseInterval = releaseInterval_;
        _releaseAmount = releaseAmount_;
        _minLockAmount = minLockAmount_;
    }

    modifier onlyAdmin {
        require(msg.sender == admin, "Timelock: Only admin is allowed to call this function");
        _;
    }

    /// @notice Do not allow contract to accept any BNB
    fallback() external payable {
        revert("Timelock: Contract is not allowed to accept any BNB");
    }

    /// ADMIN FUNCTIONS ///

    function setAdmin(address newAdmin) external onlyAdmin {
        address oldAdmin = admin;
        admin = newAdmin;
        emit NewAdmin(oldAdmin, newAdmin);
    }

    function setToken(IERC20 newToken) external onlyAdmin {
        IERC20 oldToken = _token;
        _token = newToken;
        emit NewToken(address(oldToken), address(newToken));
    }

    function setBeneficiary(address newBeneficiary) external onlyAdmin {
        address oldBeneficiary = _beneficiary;
        _beneficiary = newBeneficiary;
        emit NewBeneficiary(oldBeneficiary, newBeneficiary);
    }

    function setReleaseInterval(uint256 newReleaseInterval) external onlyAdmin {
        uint256 oldReleaseInterval = _releaseInterval;
        _releaseInterval = newReleaseInterval;
        emit NewReleaseInterval(oldReleaseInterval, newReleaseInterval);
    }

    function setReleaseAmount(uint256 newReleaseAmount) external onlyAdmin {
        uint256 oldReleaseAmount = _releaseAmount;
        _releaseAmount = newReleaseAmount;
        emit NewReleaseAmount(oldReleaseAmount, newReleaseAmount);
    }

    /// Main Actions ///
    function deposit(uint256 amount) public {
        require(_token.balanceOf(address(this)) == 0, "Timelock: Current timelock balance is not zero");
        require(amount >= _minLockAmount, "Timelock: Amount is less than required minimum locked amount");

        _startBlock = getBlockNumber();
        _token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function release() public {
        require(block.number >= _startBlock, "Timelock: Current block is less than start block");
        require(block.number >= _startBlock.add(_releaseInterval), "Timelock: Current block is before release block");
        uint256 amount = _token.balanceOf(address(this));
        require(amount > 0, "Timelock: No tokens to release");

        uint256 actualAmount;
        if (amount >= _releaseAmount) {
            actualAmount = _releaseAmount;
        } else {
            actualAmount = amount;
        }

        uint256 oldStartBlock = _startBlock;
        _startBlock = oldStartBlock.add(_releaseInterval);

        _token.safeTransfer(_beneficiary, actualAmount);
    }

    function token() public view returns (IERC20) {
        return _token;
    }

    function timelockBalance() public view returns (uint256) {
        return _token.balanceOf(address(this));
    }

    function beneficiary() public view returns (address) {
        return _beneficiary;
    }

    function startBlock() public view returns (uint256) {
        return _startBlock;
    }

    function releaseInterval() public view returns (uint256) {
        return _releaseInterval;
    }

    function releaseBlock() public view returns (uint256) {
        return _startBlock.add(_releaseInterval);
    }

    function releaseAmount() public view returns (uint256) {
        return _releaseAmount;
    }

    function getBlockNumber() public view returns (uint256) {
        return block.number;
    }
}
