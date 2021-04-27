import { parseEther } from '@ethersproject/units'
import { BigNumber } from 'bignumber.js'
import chai, { expect } from 'chai'
import { ethers } from 'hardhat'
import { formatEth, parseEth } from './utils/parseEth'
import { advanceBlockTo } from './utils/time'

chai.use(require('chai-bignumber')(BigNumber))

describe('FeedFarm', function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.deployer = this.signers[0]
    this.alex = this.signers[1]
    this.bob = this.signers[2]
    this.catheryn = this.signers[3]
    this.dev = this.signers[4]
    this.ins = this.signers[5]
    this.tax = this.signers[6]
    this.treasury = this.signers[7]

    this.FeedFarm = await ethers.getContractFactory('FeedFarm')
    this.FeedToken = await ethers.getContractFactory('FeedToken')
    this.ERC20Mock = await ethers.getContractFactory('ERC20Mock')

    this.emptyAddress = '0x0000000000000000000000000000000000000000'
  })

  beforeEach(async function () {
    this.feed = await this.FeedToken.deploy(
      this.treasury.address,
      parseEth('100000000')
    )
    await this.feed.deployed()
  })

  it('should set correct state address', async function () {
    this.farm = await this.FeedFarm.deploy(
      this.feed.address,
      this.dev.address,
      this.ins.address,
      this.tax.address,
      parseEth('200'),
      '100',
      '100'
    )

    await this.farm.deployed()

    await this.feed.transferOwnership(this.farm.address)

    const feed = await this.farm.feed()
    const devAddr = await this.farm.devAddr()
    const feeAddr = await this.farm.feeAddr()
    const owner = await this.feed.owner()
    const feedPerBlock = await this.farm.feedPerBlock()
    const startBlock = await this.farm.startBlock()
    const reductionInterval = await this.farm.reductionInterval()

    expect(feed).to.equal(this.feed.address, 'Farm: token not match')
    expect(devAddr).to.equal(this.dev.address, 'Farm: dev address not match')
    expect(feeAddr).to.equal(this.tax.address, 'Farm: tax address not match')
    expect(owner).to.equal(this.farm.address, 'Farm: token owner is not farm')
    expect(feedPerBlock).to.equal(
      parseEth('200'),
      'Farm: feedPerBlock is not match'
    )
    expect(startBlock).to.equal('100', 'Farm: start block is not match')
    expect(reductionInterval).to.equal(
      '100',
      'Farm: reduction interval is not match'
    )
  })

  it('should allow dev and only dev to update dev address', async function () {
    this.farm = await this.FeedFarm.deploy(
      this.feed.address,
      this.dev.address,
      this.ins.address,
      this.tax.address,
      parseEth('200'),
      '100',
      '100'
    )

    expect(await this.farm.devAddr()).to.equal(
      this.dev.address,
      'Farm: dev address is not match'
    )

    await expect(
      this.farm.connect(this.bob).changeDevAddr(this.bob.address, {
        from: this.bob.address
      })
    ).to.be.revertedWith('Farm: Only dev can change dev address')

    await this.farm
      .connect(this.dev)
      .changeDevAddr(this.bob.address, { from: this.dev.address })

    expect(await this.farm.devAddr()).equal(
      this.bob.address,
      'Farm: Dev address is not bob'
    )

    await this.farm
      .connect(this.bob)
      .changeDevAddr(this.alex.address, { from: this.bob.address })

    expect(await this.farm.devAddr()).equal(
      this.alex.address,
      'Farm: Dev address is not alex'
    )
  })

  it('should allow insurer and insurer ins to update insurance address', async function () {
    this.farm = await this.FeedFarm.deploy(
      this.feed.address,
      this.dev.address,
      this.ins.address,
      this.tax.address,
      parseEth('200'),
      '100',
      '100'
    )

    expect(await this.farm.insAddr()).to.equal(
      this.ins.address,
      'Farm: insurer address is not match'
    )

    await expect(
      this.farm.connect(this.bob).changeInsAddr(this.bob.address, {
        from: this.bob.address
      })
    ).to.be.revertedWith('Farm: Only insurer can change insurance address')

    await this.farm
      .connect(this.ins)
      .changeInsAddr(this.bob.address, { from: this.ins.address })

    expect(await this.farm.insAddr()).equal(
      this.bob.address,
      'Farm: Insurance address is not bob'
    )

    await this.farm
      .connect(this.bob)
      .changeInsAddr(this.alex.address, { from: this.bob.address })

    expect(await this.farm.insAddr()).equal(
      this.alex.address,
      'Farm: Insurance address is not alex'
    )
  })

  it('should allow fee collector update fee collector address', async function () {
    this.farm = await this.FeedFarm.deploy(
      this.feed.address,
      this.dev.address,
      this.ins.address,
      this.tax.address,
      parseEth('200'),
      '100',
      '100'
    )

    expect(await this.farm.feeAddr()).to.equal(
      this.tax.address,
      'Farm: fee collector address is not match'
    )

    await expect(
      this.farm.connect(this.bob).changeFeeAddr(this.bob.address, {
        from: this.bob.address
      })
    ).to.be.revertedWith(
      'Farm: Only fee collector can change fee collector address'
    )

    await this.farm
      .connect(this.tax)
      .changeFeeAddr(this.bob.address, { from: this.tax.address })

    expect(await this.farm.feeAddr()).equal(
      this.bob.address,
      'Farm: Fee collector address is not bob'
    )

    await this.farm
      .connect(this.bob)
      .changeFeeAddr(this.alex.address, { from: this.bob.address })

    expect(await this.farm.feeAddr()).equal(
      this.alex.address,
      'Farm: Fee collector address is not alex'
    )
  })

  context('With ERC/LP token added to the field', function () {
    beforeEach(async function () {
      this.lp = await this.ERC20Mock.deploy('LP Token', 'LP', '10000000000')
      await this.lp.transfer(this.alex.address, '1000')
      await this.lp.transfer(this.bob.address, '1000')
      await this.lp.transfer(this.catheryn.address, '1000')

      this.lp2 = await this.ERC20Mock.deploy('LP Token 2', 'LP2', '10000000000')
      await this.lp2.transfer(this.alex.address, '1000')
      await this.lp2.transfer(this.bob.address, '1000')
      await this.lp2.transfer(this.catheryn.address, '1000')
    })

    it('should not return any token if the pool does not exists', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('200'),
        '100',
        '100'
      )

      this.farm.deployed()

      await expect(
        this.farm.getPoolIdForLpToken(this.lp.address)
      ).to.revertedWith('Farm: Token does not exists in any pool')
    })

    it('should distribute token according to schedule', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('250000'),
        '100',
        '100'
      )
      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '0', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '100')
      await this.lp.connect(this.bob).approve(this.farm.address, '100')

      await advanceBlockTo(99)
      await this.farm.connect(this.alex).deposit(0, '100', this.emptyAddress) // Block 100
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('900')
      expect((await this.farm.userInfo(0, this.alex.address)).amount).to.equal(
        '100'
      )

      await advanceBlockTo(199)
      await this.farm
        .connect(this.deployer)
        .updateEmissionRate(parseEth('225000'))
      expect(await this.farm.feedPerBlock()).to.equal(parseEth('225000'))

      await advanceBlockTo(249)
      await this.farm.connect(this.bob).deposit(0, '100', this.emptyAddress) // Block 250

      await advanceBlockTo(299)
      await this.farm
        .connect(this.deployer)
        .updateEmissionRate(parseEth('200000')) // Block 300
      await this.farm.connect(this.alex).deposit(0, '0', this.emptyAddress) // Block 301
      // Alex should have
      // ((250000*100) + (225000*50) + (225000*50*0.5) + (200000*1*0.5)) * 0.93 = 39,036,750
      expect(await this.feed.balanceOf(this.alex.address)).to.equal(
        parseEth('39036750')
      )
      // Dev should have ((250000*100) + (225000*100) + (200000*1)) * 0.05 = 2,385,000
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEth('2385000')
      )
      // Insurance should have ((250000*100) + (225000*100) + (200000*1)) * 0.02 = 954,000
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEth('954000')
      )
      // Bob should have ((225000*50*0.5) + (200000*1*0.5)) * 0.93 = 5,324,250
      expect(await this.farm.pendingFeed(0, this.bob.address)).to.equal(
        parseEth('5324250')
      )
      // Total supply should be (250000*100) + (225000*100) + (200000*1) = 47,700,000 + 31,750,000 = 79,450,000
      expect(await this.feed.totalSupply()).to.equal(parseEth('79450000'))

      await advanceBlockTo(419)
      await this.farm.connect(this.alex).deposit(0, '0', this.emptyAddress) // Block 420
      // Alex should have (Emission should end at block 403.75)
      // (39036750 + ((200000*102.75*0.5) * 0.93)) = 48,592,500
      expect(await this.feed.balanceOf(this.alex.address)).to.equal(
        parseEth('48592500')
      )
      // Bob should have
      // (5324250 + ((200000*102.75*0.5) * 0.93)) = 14,880,000
      expect(await this.farm.pendingFeed(0, this.bob.address)).to.equal(
        parseEth('14880000')
      )
      // Dev should have (2385000 + ((200000*102.75) * 0.05)) = 3,412,500
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEth('3412500')
      )
      // Insurance should have (954000 + ((200000*102.75) * 0.02)) = 1,365,000
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEth('1365000')
      )
      expect(await this.feed.totalSupply()).to.equal(parseEth('100000000'))
    })

    it('should allow emergency withdraw', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '200',
        '100'
      )
      await this.farm.deployed()
      await this.farm.add('100', this.lp.address, '0', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '100')
      await this.farm.connect(this.alex).deposit(0, '100', this.emptyAddress)
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('900')
      expect((await this.farm.userInfo(0, this.alex.address)).amount).to.equal(
        '100'
      )
      await this.farm.connect(this.alex).emergencyWithdraw(0)
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('1000')
      expect((await this.farm.userInfo(0, this.alex.address)).amount).to.equal(
        '0'
      )
    })

    it('should give out FEEDs only after farming time', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '500',
        '100'
      )

      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '0', true)

      await this.lp.connect(this.alex).approve(this.farm.address, '1000')
      await this.farm.connect(this.alex).deposit(0, '100', this.emptyAddress)
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('900')
      expect((await this.farm.userInfo(0, this.alex.address)).amount).to.equal(
        '100'
      )
      expect(await this.feed.balanceOf(this.alex.address)).to.equal('0') // block 1
      await advanceBlockTo(489)

      await this.farm.connect(this.alex).deposit(0, '0', this.emptyAddress)
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('900')
      expect((await this.farm.userInfo(0, this.alex.address)).amount).to.equal(
        '100'
      )
      expect(await this.feed.balanceOf(this.alex.address)).to.equal('0') // block 90
      await advanceBlockTo(499)

      await this.farm.connect(this.alex).deposit(0, '0', this.emptyAddress)
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('900')
      expect((await this.farm.userInfo(0, this.alex.address)).amount).to.equal(
        '100'
      )
      expect(await this.feed.balanceOf(this.alex.address)).to.equal('0') // block 100
      await advanceBlockTo(504)

      await this.farm.connect(this.alex).deposit(0, '0', this.emptyAddress)
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('900')
      expect((await this.farm.userInfo(0, this.alex.address)).amount).to.equal(
        '100'
      )
      expect(await this.feed.balanceOf(this.alex.address)).to.equal(
        parseEth('465')
      )
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEth('25')
      )
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEth('10')
      )
    })

    it('should not distribute FEEDs if no one deposit', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '600',
        '100'
      )

      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '0', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '1000')
      await advanceBlockTo(599)
      expect(await this.feed.totalSupply()).to.equal(parseEth('31750000'))
      await advanceBlockTo(604)
      expect(await this.feed.totalSupply()).to.equal(parseEth('31750000'))
      await advanceBlockTo(609)
      expect(await this.feed.totalSupply()).to.equal(parseEth('31750000'))
      await this.farm.connect(this.alex).deposit(0, '100', this.emptyAddress) // block 210
      expect(await this.feed.totalSupply()).to.equal(parseEth('31750000'))
      expect(await this.feed.balanceOf(this.alex.address)).to.equal('0')
      expect(await this.feed.balanceOf(this.dev.address)).to.equal('0')
      expect(await this.feed.balanceOf(this.ins.address)).to.equal('0')
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('900')
      await advanceBlockTo(619)
      await this.farm.connect(this.alex).withdraw(0, '100') // block 220
      expect((await this.feed.totalSupply()).toString()).to.equal(
        parseEth('31751000')
      )
      expect(await this.feed.balanceOf(this.alex.address)).to.equal(
        parseEth('930')
      )
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEth('50')
      )
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEth('20')
      )
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('1000')
    })

    it('should distribute FEEDs properly for each staker', async function () {
      // 100 per block farming rate starting at block 300 with bonus until block 1000
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '700',
        '100'
      )
      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '0', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '1000', {
        from: this.alex.address
      })
      await this.lp.connect(this.bob).approve(this.farm.address, '1000', {
        from: this.bob.address
      })
      await this.lp.connect(this.catheryn).approve(this.farm.address, '1000', {
        from: this.catheryn.address
      })
      // Alex deposits 10 LPs at block 710
      await advanceBlockTo(709)
      await this.farm
        .connect(this.alex)
        .deposit(0, '10', this.emptyAddress, { from: this.alex.address })
      // Bob deposits 10 LPs at block 714
      await advanceBlockTo(713)
      await this.farm
        .connect(this.bob)
        .deposit(0, '10', this.emptyAddress, { from: this.bob.address })
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo(717)
      await this.farm
        .connect(this.catheryn)
        .deposit(0, '30', this.emptyAddress, { from: this.catheryn.address })
      // Alex deposits 30 more LPs at block 720. At this point:
      // Alex should have: ((4*100) + (4*10/20*100) + (2*10/50*100)) * 0.93 = 595.2
      // FeedFarm should have the remaining: 1000 - 595.2 - 50 - 20 = 334.8
      await advanceBlockTo(719)
      await this.farm
        .connect(this.alex)
        .deposit(0, '30', this.emptyAddress, { from: this.alex.address })
      expect(await this.feed.totalSupply()).to.equal(parseEther('31751000'))
      expect(await this.feed.balanceOf(this.alex.address)).to.equal(
        parseEther('595.2')
      )
      expect(await this.feed.balanceOf(this.bob.address)).to.equal('0')
      expect(await this.feed.balanceOf(this.catheryn.address)).to.equal('0')
      expect(await this.feed.balanceOf(this.farm.address)).to.equal(
        parseEther('334.8')
      )
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEther('50')
      )
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEther('20')
      )

      // Bob withdraws 5 LPs at block 730. At this point:
      // Bob should have: ((4*10/20*100) + (2*10/50*100) + (10*10/80*100)) * 0.93 = 339.45
      // continue
      await advanceBlockTo(729)
      await this.farm
        .connect(this.bob)
        .withdraw(0, '5', { from: this.bob.address })
      expect(await this.feed.totalSupply()).to.equal(parseEther('31752000'))
      expect(await this.feed.balanceOf(this.alex.address)).to.equal(
        parseEther('595.2')
      )
      expect(await this.feed.balanceOf(this.bob.address)).to.equal(
        parseEther('339.45')
      )
      expect(await this.feed.balanceOf(this.catheryn.address)).to.equal('0')
      expect(await this.feed.balanceOf(this.farm.address)).to.equal(
        parseEther('925.35')
      )
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEther('100')
      )
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEther('40')
      )

      // Alex withdraws 40 LPs at block 740.
      await advanceBlockTo(739)
      await this.farm
        .connect(this.alex)
        .withdraw(0, '40', { from: this.alex.address })
      expect(await this.feed.totalSupply()).to.equal(parseEther('31753000'))
      // Alex should have: 595.2 + ((10*40/80*100) +(10*40/75*100) * 0.93) = 1591.2
      expect(
        new BigNumber(
          formatEth(await this.feed.balanceOf(this.alex.address))
        ).toFixed(10)
      ).to.equal(
        new BigNumber(595.2)
          .plus(
            new BigNumber(10)
              .times(40)
              .div(80)
              .times(100)
              .plus(new BigNumber(10).times(40).div(75).times(100))
              .times(0.93)
          )
          .toFixed(10)
      )
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEther('150')
      )
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEther('60')
      )

      await advanceBlockTo(748)
      // Bob withdraws 5 LPs at block 750.
      await advanceBlockTo(749)
      await this.farm
        .connect(this.bob)
        .withdraw(0, '5', { from: this.bob.address })
      expect(await this.feed.totalSupply()).to.equal(parseEther('31754000'))
      // Bob should have: 339.45 + (((10*5/75*100) + (10*5/35*100)) * 0.93) = 534.307142857
      expect(
        new BigNumber(
          formatEth(await this.feed.balanceOf(this.bob.address))
        ).toFixed(10)
      ).to.equal(
        new BigNumber(339.45)
          .plus(
            new BigNumber(10)
              .times(5)
              .div(75)
              .times(100)
              .plus(new BigNumber(10).times(5).div(35).times(100))
              .times(0.93)
          )
          .toFixed(10)
      )
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEther('200')
      )
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEther('80')
      )

      // Catheryn withdraws 30 LPs at block 360.
      await advanceBlockTo(759)
      await this.farm
        .connect(this.catheryn)
        .withdraw(0, '30', { from: this.catheryn.address })
      expect(await this.feed.totalSupply()).to.equal(parseEther('31755000'))
      // Catheryn should have: ((2*30/50*100) + (10*30/80*100) + (10*30/75*100) + (10*30/35*100) + (10*100)) * 0.93 = 2559.492857143
      expect(
        new BigNumber(
          formatEth(await this.feed.balanceOf(this.catheryn.address))
        ).toFixed(10)
      ).to.equal(
        new BigNumber(0)
          .plus(new BigNumber(2).times(30).div(50).times(100)) // 318-320
          .plus(new BigNumber(10).times(30).div(80).times(100)) // 320-330
          .plus(new BigNumber(10).times(30).div(75).times(100)) // 330-340
          .plus(new BigNumber(10).times(30).div(35).times(100)) // 340-350
          .plus(new BigNumber(10).times(100)) // 350-360
          .times(0.93)
          .toFixed(10)
      )
      expect(await this.feed.balanceOf(this.dev.address)).to.equal(
        parseEther('250')
      )
      expect(await this.feed.balanceOf(this.ins.address)).to.equal(
        parseEther('100')
      )
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('1000')
      expect(await this.lp.balanceOf(this.bob.address)).to.equal('1000')
      expect(await this.lp.balanceOf(this.catheryn.address)).to.equal('1000')
    })

    it('should return correct pending FEEDs', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '800',
        '100'
      )
      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '0', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '1000', {
        from: this.alex.address
      })
      await this.lp.connect(this.bob).approve(this.farm.address, '1000', {
        from: this.bob.address
      })
      // Alex deposits 10 LPs at block 799
      await advanceBlockTo(799)
      await this.farm
        .connect(this.alex)
        .deposit(0, '10', this.emptyAddress, { from: this.alex.address })

      await advanceBlockTo(810)
      expect(await this.farm.pendingFeed(0, this.alex.address)).to.equal(
        parseEth('1000')
      )

      await advanceBlockTo(820)
      expect(await this.farm.pendingFeed(0, this.alex.address)).to.equal(
        parseEth('2000')
      )

      await advanceBlockTo(825)
      expect(await this.farm.pendingFeed(0, this.alex.address)).to.equal(
        parseEth('2500')
      )
    })

    it('should take LP as exit fees when exitFeeBP is set', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '800',
        '100'
      )
      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '250', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '1000', {
        from: this.alex.address
      })
      // Alex deposits 10 LPs at block 810
      await advanceBlockTo(809)
      await this.farm
        .connect(this.alex)
        .deposit(0, '1000', this.emptyAddress, { from: this.alex.address })

      // Alex withdraws 10 LPs at block 820
      await advanceBlockTo(819)
      await this.farm
        .connect(this.alex)
        .withdraw(0, '1000', { from: this.alex.address })
      expect(await this.lp.balanceOf(this.alex.address)).to.equal('975')
      expect(await this.lp.balanceOf(this.tax.address)).to.equal('25')
    })

    it('should not able to set exitFeeBP exceeds maximum exitFeeBP', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '0',
        '100'
      )
      await this.farm.deployed()
      await this.farm.add('100', this.lp.address, '0', true)
      await expect(
        this.farm.connect(this.deployer).set(0, '100', '1250', true)
      ).to.be.revertedWith('Farm(set): invalid exit fee basis points')

      await expect(
        this.farm.add('100', this.lp2.address, '1250', true)
      ).to.be.revertedWith('Farm(add): invalid exit fee basis points')
    })

    it('should not allow withdrawal amount to be larger than the deposited amount', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '0',
        '100'
      )
      await this.farm.deployed()
      await this.farm.add('100', this.lp.address, '0', true)

      await this.lp.connect(this.alex).approve(this.farm.address, '1000', {
        from: this.alex.address
      })
      await this.farm.connect(this.alex).deposit(0, '100', this.emptyAddress)

      await expect(
        this.farm.connect(this.alex).withdraw(0, '105')
      ).to.revertedWith(
        'Farm: Withdraw amount is larger than available balance'
      )
    })

    it('should be able to set exitFeeBP within maximum exitFeeBP', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '0',
        '100'
      )
      await this.farm.deployed()
      await this.farm.add('100', this.lp.address, '0', true)
      await this.farm.connect(this.deployer).set(0, '100', '1000', true)
      expect((await this.farm.poolInfo(0)).exitFeeBP).to.be.equal(1000)
    })

    it('should return the correct number of pool length', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '0',
        '100'
      )

      await this.farm.deployed()
      await this.farm.add('100', this.lp.address, '0', true)
      expect(await this.farm.poolLength()).to.equal(1)
      await this.farm.add('100', this.lp2.address, '0', true)
      expect(await this.farm.poolLength()).to.equal(2)
    })

    it('should allow only owner to set emission rate', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '0',
        '100'
      )
      await this.farm.deployed()
      await expect(
        this.farm.connect(this.alex).updateEmissionRate(parseEth('200'))
      ).to.be.revertedWith('Ownable: caller is not the owner')
      expect(await this.farm.feedPerBlock()).to.equal(parseEth('100'))

      await this.farm.connect(this.deployer).updateEmissionRate(parseEth('200'))
      expect(await this.farm.feedPerBlock()).to.equal(parseEth('200'))
    })

    it('should allow setting emission rate only after mining starts', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '1000',
        '100'
      )
      await this.farm.deployed()
      await expect(
        this.farm.connect(this.deployer).updateEmissionRate(parseEth('200'))
      ).to.be.revertedWith(
        'Farm: Emission rate can only update after mining starts'
      )
      expect(await this.farm.feedPerBlock()).to.equal(parseEth('100'))

      await advanceBlockTo(1100)
      await this.farm.connect(this.deployer).updateEmissionRate(parseEth('200'))
      expect(await this.farm.feedPerBlock()).to.equal(parseEth('200'))
    })

    it('should allow to update emission rate after each interval is over', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '1000',
        '100'
      )
      await this.farm.deployed()

      await advanceBlockTo(1199)
      await this.farm.connect(this.deployer).updateEmissionRate(parseEth('50'))
      expect(await this.farm.feedPerBlock()).to.equal(parseEth('50'))

      await advanceBlockTo(1244)
      await expect(
        this.farm.connect(this.deployer).updateEmissionRate(parseEth('12.5'))
      ).to.be.revertedWith('Farm: Emission rate in reduction interval')

      await advanceBlockTo(1299)
      await this.farm
        .connect(this.deployer)
        .updateEmissionRate(parseEth('12.5'))
      expect(await this.farm.feedPerBlock()).to.equal(parseEth('12.5'))
    })

    it('should not allow duplicated to be added', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '100',
        '100'
      )

      await this.farm.deployed()
      await this.farm.add('100', this.lp.address, '0', true)

      await expect(
        this.farm.add('100', this.lp.address, '0', true)
      ).to.revertedWith('Farm: Duplicated pool')

      expect(await this.farm.getPoolIdForLpToken(this.lp.address)).to.equal('0')
    })

    it('should pay commission to the referrer when harvesting rewards', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '1500',
        '100'
      )

      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '0', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '100')

      await advanceBlockTo(1499)
      await this.farm.connect(this.alex).deposit(0, '100', this.bob.address) // Block 100
      expect(await this.farm.getReferral(this.alex.address)).to.equal(
        this.bob.address
      )

      await advanceBlockTo(1599)
      await this.farm.connect(this.alex).deposit(0, '0', this.emptyAddress) // Block 200
      expect(await this.feed.balanceOf(this.alex.address)).to.equal(
        parseEth('9114')
      )
      expect(await this.feed.balanceOf(this.bob.address)).to.equal(
        parseEth('186')
      )
    })

    it('should set referral address when user referred by another user', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '1700',
        '100'
      )

      await this.farm.deployed()
      await this.feed.transferOwnership(this.farm.address)
      await this.farm.add('100', this.lp.address, '0', true)
      await this.lp.connect(this.alex).approve(this.farm.address, '100')

      await advanceBlockTo(1699)
      await this.farm.connect(this.alex).deposit(0, '100', this.bob.address) // Block 100
      expect(await this.farm.getReferral(this.alex.address)).to.equal(
        this.bob.address
      )
    })

    it('should allow only the owner to update referral bonus point', async function () {
      this.farm = await this.FeedFarm.deploy(
        this.feed.address,
        this.dev.address,
        this.ins.address,
        this.tax.address,
        parseEth('100'),
        '0',
        '100'
      )
      await this.farm.deployed()
      await expect(
        this.farm.connect(this.alex).updateReferralBonusBp('400')
      ).to.be.revertedWith('Ownable: caller is not the owner')
      expect(await this.farm.refBonusBP()).to.equal('200')

      await this.farm.connect(this.deployer).updateReferralBonusBp('400')
      expect(await this.farm.refBonusBP()).to.equal('400')

      await expect(
        this.farm.connect(this.deployer).updateReferralBonusBp('2001')
      ).to.revertedWith('Farm: Referral bonus has reached maxmimum threshold')

      await expect(
        this.farm.connect(this.deployer).updateReferralBonusBp('400')
      ).to.revertedWith('Farm: Referral bonus is the same')
    })
  })
})
