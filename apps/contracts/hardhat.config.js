/**
 * @type import('hardhat/config').HardhatUserConfig
 */

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require('dotenv').config();
require('solidity-coverage');
require('@nomiclabs/hardhat-ethers');
require("@nomicfoundation/hardhat-chai-matchers");
require("hardhat-gas-reporter");
require("solidity-docgen");
require("@nomicfoundation/hardhat-verify")

const PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  solidity: {
    version: '0.8.23',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  gasReporter: {
    token: 'ETH',
    currency: 'USD',
    gasPriceApi: 'https://api.etherscan.io/api?module=proxy&action=eth_gasPrice',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    enabled: (process.env.REPORT_GAS) ? true : false,
    showTimeSpent: true,
    showMethodSig: true,
    outputFile: 'gas-report.txt',
    noColors: true
  },
  docgen: {
    outputDir: './docs',
    pages: 'files'
  },

  networks: {
    hardhat: {
      chains: {
        99: {
          hardforkHistory: {
            berlin: 10000000,
            london: 20000000,
          },
        }
      }
    },
    sepolia: {
      url: "https://eth-sepolia.g.alchemy.com/v2/WSfPp7PZYjX8uXeDOFfk_GFBBSCrCyxg",
      accounts: [PRIVATE_KEY]
    },
    polygonMumbai: {
      url: "https://polygon-mumbai.infura.io/v3/f1758a52ca744a9081a25196d3128ea0",
      accounts: [PRIVATE_KEY],
      timeout: 60000000

    },
    arbiGoerli: {
      url: "https://goerli-rollup.arbitrum.io/rpc",
      accounts: [PRIVATE_KEY]
    },
    arbiSepolia: {
      url: "https://billowing-long-ensemble.arbitrum-sepolia.quiknode.pro/e0c76079c7d67ed114812420ba1d4472a30c93fa",
      accounts: [PRIVATE_KEY]
    },
  },
  paths: {
    sources: './src',
    tests: './tests',
    cache: './build/cache',
    artifacts: './build/artifacts',
  },

  etherscan:
  {
    apiKey: {
      arbiGoerli: process.env.ARBISCAN_KEY,
      arbiSepolia: process.env.ARBISCAN_KEY,
      polygonMumbai: process.env.POLYGONSCAN_KEY,
      sepolia: process.env.ETHERSCAN_KEY
    },
    customChains: [
      {
        network: "arbiGoerli",
        chainId: 421613,
        urls: {
          apiURL: "https://goerli-rollup.arbitrum.io/rpc",
          browserURL: "https://goerli.arbiscan.io"
        }
      },
      {
        network: "arbiSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://billowing-long-ensemble.arbitrum-sepolia.quiknode.pro/e0c76079c7d67ed114812420ba1d4472a30c93fa",
          browserURL: "https://sepolia.arbiscan.io"
        }
      }
    ]
  }

};
