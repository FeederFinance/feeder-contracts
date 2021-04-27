import { expect } from 'chai'
import { ethers } from 'hardhat'
import { parseEth } from './utils/parseEth'

describe('FeedToken', function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.deployer = this.signers[0]
    this.alex = this.signers[1]
    this.bob = this.signers[2]
    this.catheryn = this.signers[3]
    this.treasury = this.signers[4]

    this.FeedToken = await ethers.getContractFactory('FeedToken')
    this.feed = await this.FeedToken.deploy(
      this.treasury.address,
      parseEth('100000000')
    )
    await this.feed.deployed()
  })

  it('should mint 31,750,000 FEEDs to treasury wallet', async function () {
    const devBalance = await this.feed.balanceOf(this.treasury.address)
    expect(devBalance).to.equal(parseEth('31750000'))
  })

  it('should be able to transfer to another user', async function () {
    await this.feed
      .connect(this.treasury)
      .transfer(this.alex.address, parseEth(10))
    expect(await this.feed.balanceOf(this.alex.address)).to.equal(parseEth(10))
  })

  it('should not be able to mint more than 100,000,000 FEEDs', async function () {
    await expect(
      this.feed.mintTo(this.treasury.address, parseEth('100000000'))
    ).to.be.revertedWith('ERC20Capped: cap exceeded')
  })

  it('should able to mint exactly 100,000,000 FEEDs', async function () {
    await this.feed.mintTo(this.treasury.address, parseEth('68250000'))
    expect(await this.feed.totalSupply()).to.equal(parseEth('100000000'))
  })
})
