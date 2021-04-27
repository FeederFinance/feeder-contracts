const { parseEther, formatEther } = require('ethers/lib/utils')

export const formatEth = (amount: string | number) => formatEther(amount.toString())
export const parseEth = (amount: string | number) => parseEther(amount.toString())