require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "istanbul" // Correct EVM version for Solidity 0.8.0
    }
  },
  networks: {
    studio: {
      url: process.env.STUDIO_RPC_URL || "https://mainnet2.studio-blockchain.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 240241
    },
    bsc: {
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56
    }
  },
  etherscan: {
    apiKey: {
      studio: "dummy" // API key is not required for Studio, but the field is needed
    },
    customChains: [
      {
        network: "studio",
        chainId: 240241,
        urls: {
          apiURL: "https://mainnetindexer.studio-blockchain.com/contracts/verify",
          browserURL: "https://studio-scan.com"
        }
      }
    ]
  }
};
