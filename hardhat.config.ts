import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-etherscan'
import 'hardhat-deploy'
import 'hardhat-gas-reporter'
import 'hardhat-watcher'
import 'solidity-coverage'

const accounts = {
  mnemonic:
    process.env.MNEMONIC ||
    'test test test test test test test test test test test junk'
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  abiExporter: {
    path: './abi',
    clear: false,
    flat: true
    // only: [],
    // except: []
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: 'USD',
    enabled: process.env.REPORT_GAS === 'true',
    excludeContracts: ['contracts/mocks/', 'contracts/libraries/']
  },
  mocha: {
    timeout: 20000
  },
  namedAccounts: {
    deployer: {
      default: 0
    },
    treasury: {
      default: 1,
      56: process.env.WALLET_BSC_MAINNET_TREASURY
    },
    insurance: {
      default: 2,
      56: process.env.WALLET_BSC_MAINNET_INSURANCE
    },
    feesCollector: {
      default: 3,
      56: process.env.WALLET_BSC_MAINNET_FEES_COLLECTOR
    },
    dev: {
      default: 4,
      56: process.env.WALLET_BSC_MAINNET_DEV
    }
  },
  networks: {
    localhost: {
      live: false,
      saveDeployments: true,
      tags: ['local'],
      chainId: 1337
    },
    hardhat: {
      live: false,
      saveDeployments: true,
      tags: ['test', 'local'],
      chainId: 1337
    },
    bsc: {
      url: 'https://bsc-dataseed.binance.org/',
      accounts,
      chainId: 56,
      live: true,
      saveDeployments: true
    },
    'bsc-testnet': {
      url: 'https://data-seed-prebsc-2-s3.binance.org:8545',
      accounts,
      chainId: 97,
      live: true,
      saveDeployments: true,
      tags: ['staging'],
      gasMultiplier: 2
    }
  },
  solidity: {
    compilers: [
      {
        version: '0.7.3',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  },
  watcher: {
    compile: {
      tasks: ['compile'],
      files: ['./contracts'],
      verbose: true
    },
    test: {
      tasks: [{ command: 'test', params: { testFiles: ['{path}'] } }],
      files: ['./test/**/*'],
      verbose: true
    }
  }
}
