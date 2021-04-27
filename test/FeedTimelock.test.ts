import { BigNumber } from 'bignumber.js'
import chai, { expect } from 'chai'
import { ethers } from 'hardhat'
import { parseEth } from './utils/parseEth'
import { advanceBlockTo } from './utils/time'

chai.use(require('chai-bignumber')(BigNumber))

describe('FeedTimelock', function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.deployer = this.signers[0]
    this.treasury = this.signers[1]

    this.FeedToken = await ethers.getContractFactory('FeedToken')
    this.FeedTimelock = await ethers.getContractFactory('FeedTimelock')
    this.ERC20Mock = await ethers.getContractFactory('ERC20Mock')
  })

  beforeEach(async function () {
    this.feed = await this.FeedToken.deploy(
      this.treasury.address,
      parseEth('100000000')
    )
    this.mock = await this.ERC20Mock.deploy('Mock Token', 'MOCK', '10000000000')
    await this.feed.deployed()

    this.timelock = await this.FeedTimelock.deploy(
      this.feed.address,
      this.treasury.address,
      806400, // Release Interval = 28 days
      parseEth('1671875'), // Release Amount
      parseEth('26750000') // Min Lock Amount
    )
    await this.timelock.deployed()
    await this.timelock.setAdmin(this.treasury.address)
  })

  it('should return correct views variable', async function () {
    await this.timelock.deployed()
    expect(await this.timelock.token()).to.equal(this.feed.address)
    expect(await this.timelock.beneficiary()).to.equal(this.treasury.address)
    expect(await this.timelock.releaseBlock()).to.equal(806400)
  })

  it('should set release interval', async function () {
    await this.timelock.connect(this.treasury).setReleaseInterval(6500)
    expect(await this.timelock.releaseInterval()).to.equal(6500)
  })

  it('should set release beneficiary address', async function () {
    await this.timelock
      .connect(this.treasury)
      .setBeneficiary(this.deployer.address)
    expect(await this.timelock.beneficiary()).to.equal(this.deployer.address)

    await this.timelock
      .connect(this.treasury)
      .setBeneficiary(this.treasury.address)
    expect(await this.timelock.beneficiary()).to.equal(this.treasury.address)
  })

  it('should set token address', async function () {
    await this.timelock.connect(this.treasury).setToken(this.mock.address)
    expect(await this.timelock.token()).to.equal(this.mock.address)

    await this.timelock.connect(this.treasury).setToken(this.feed.address)
    expect(await this.timelock.token()).to.equal(this.feed.address)
  })

  it('should set release amount', async function () {
    await this.timelock
      .connect(this.treasury)
      .setReleaseAmount(parseEth('1000'))
    expect(await this.timelock.releaseAmount()).to.equal(parseEth('1000'))

    await this.timelock
      .connect(this.treasury)
      .setReleaseAmount(parseEth('937500'))
    expect(await this.timelock.releaseAmount()).to.equal(parseEth('937500'))
  })

  it('should return the correct block number', async function () {
    expect(await this.timelock.getBlockNumber()).to.equal(
      await ethers.provider.getBlockNumber()
    )
  })

  it('should only allow admin to perform actions', async function () {
    await expect(
      this.timelock.connect(this.deployer).setAdmin(this.deployer.address)
    ).to.revertedWith('Timelock: Only admin is allowed to call this function')

    await expect(
      this.timelock.connect(this.deployer).setBeneficiary(this.deployer.address)
    ).to.revertedWith('Timelock: Only admin is allowed to call this function')

    await this.timelock
      .connect(this.treasury)
      .setBeneficiary(this.treasury.address)
    expect(await this.timelock.beneficiary()).to.equal(this.treasury.address)
  })

  it('should deposit token to timelock', async function () {
    await this.feed
      .connect(this.treasury)
      .approve(this.timelock.address, parseEth('26750000'))
    await this.timelock.connect(this.treasury).deposit(parseEth('26750000'))
    expect(await this.timelock.startBlock()).to.equal(
      await ethers.provider.getBlockNumber()
    )
    expect(await this.timelock.timelockBalance()).to.equal(parseEth('26750000'))
    expect(await this.feed.balanceOf(this.treasury.address)).to.equal(
      parseEth('5000000')
    )
  })

  it('should not release token before release time', async function () {
    await expect(this.timelock.release()).to.be.revertedWith(
      'Timelock: Current block is before release block'
    )
    advanceBlockTo(1000)
    await expect(this.timelock.release()).to.be.revertedWith(
      'Timelock: Current block is before release block'
    )
  })

  it('should release token after release time', async function () {
    await this.timelock.connect(this.treasury).setReleaseInterval(100)
    await this.feed
      .connect(this.treasury)
      .approve(this.timelock.address, parseEth('26750000'))

    await advanceBlockTo(199)
    await this.timelock.connect(this.treasury).deposit(parseEth('26750000'))
    const releaseBlock = await this.timelock.releaseBlock()
    await advanceBlockTo(releaseBlock)
    await this.timelock.release()
    expect(await this.feed.balanceOf(this.treasury.address)).to.equal(
      parseEth('6671875')
    )
  })

  it('should release token according to release schedule', async function () {
    await this.timelock.connect(this.treasury).setReleaseInterval(100)
    await this.feed
      .connect(this.treasury)
      .approve(this.timelock.address, parseEth('26750000'))

    await advanceBlockTo(199)
    await this.timelock.connect(this.treasury).deposit(parseEth('26750000'))
    for (let i = 1; i <= 16; i++) {
      const timelockBalance = await this.timelock.timelockBalance()
      const releaseAmount = await this.timelock.releaseAmount()
      const treasuryBalance = await this.feed.balanceOf(this.treasury.address)
      await advanceBlockTo(await this.timelock.releaseBlock())
      await this.timelock.release()
      expect(await this.feed.balanceOf(this.treasury.address)).to.equal(
        treasuryBalance.add(releaseAmount)
      )
      expect(await this.feed.balanceOf(this.timelock.address)).to.equal(
        timelockBalance.sub(releaseAmount)
      )
    }
    expect(await this.feed.balanceOf(this.treasury.address)).to.equal(
      parseEth('31750000')
    )
    expect(await this.feed.balanceOf(this.timelock.address)).to.equal('0')
  })

  it('should release token even remaining is less than release amount', async function () {
    await this.timelock.connect(this.treasury).setReleaseInterval(100)
    await this.timelock
      .connect(this.treasury)
      .setReleaseAmount(parseEth('14000000'))
    await this.feed
      .connect(this.treasury)
      .approve(this.timelock.address, parseEth('26750000'))

    await advanceBlockTo(199)
    await this.timelock.connect(this.treasury).deposit(parseEth('26750000'))
    for (let i = 1; i <= 2; i++) {
      const timelockBalance = await this.timelock.timelockBalance()
      const releaseAmount =
        i === 1 ? await this.timelock.releaseAmount() : parseEth('12750000')
      const treasuryBalance = await this.feed.balanceOf(this.treasury.address)
      await advanceBlockTo(await this.timelock.releaseBlock())
      await this.timelock.release()
      expect(await this.feed.balanceOf(this.treasury.address)).to.equal(
        treasuryBalance.add(releaseAmount)
      )
      expect(await this.feed.balanceOf(this.timelock.address)).to.equal(
        timelockBalance.sub(releaseAmount)
      )
    }
    expect(await this.feed.balanceOf(this.treasury.address)).to.equal(
      parseEth('31750000')
    )
    expect(await this.feed.balanceOf(this.timelock.address)).to.equal('0')
  })

  it('should not accept any BNB', async function () {
    await expect(
      this.deployer.sendTransaction({
        to: this.timelock.address,
        value: parseEth('1')
      })
    ).to.revertedWith('Timelock: Contract is not allowed to accept any BNB')
  })

  it('should not allow any deposit if there is already tokens locked', async function () {
    await this.feed
      .connect(this.treasury)
      .approve(this.timelock.address, parseEth('31750000'))
    await this.timelock.connect(this.treasury).deposit(parseEth('26750000'))

    await expect(
      this.timelock.connect(this.treasury).deposit(parseEth('26750000'))
    ).to.revertedWith('Timelock: Current timelock balance is not zero')
  })

  it('should not allow deposit less than the required minimum', async function () {
    await this.feed
      .connect(this.treasury)
      .approve(this.timelock.address, parseEth('15000000'))

    await expect(
      this.timelock.connect(this.treasury).deposit(parseEth('5000000'))
    ).to.revertedWith(
      'Timelock: Amount is less than required minimum locked amount'
    )
  })

  it('should release any token if the balance is empty', async function () {
    const timelock = await this.FeedTimelock.deploy(
      this.feed.address,
      this.treasury.address,
      100,
      parseEth('0'),
      parseEth('0')
    )
    await this.timelock.deployed()

    advanceBlockTo(100)

    await expect(timelock.release()).to.be.revertedWith(
      'Timelock: No tokens to release'
    )
  })
})
