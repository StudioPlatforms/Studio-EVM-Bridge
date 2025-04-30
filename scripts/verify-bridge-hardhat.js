const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  // Bridge contract address
  const bridgeAddress = studioDeploymentData.bridge;
  
  // Constructor arguments
  const constructorArgs = [
    240241, // Chain ID
    ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"], // Initial relayers
    1 // Relayer threshold
  ];
  
  console.log(`Verifying Bridge contract at ${bridgeAddress}...`);
  
  try {
    // Update hardhat.config.js temporarily to use the correct settings
    const hardhatConfigPath = path.resolve(__dirname, '../hardhat.config.js');
    const originalConfig = fs.readFileSync(hardhatConfigPath, 'utf8');
    
    // Create a backup of the original config
    fs.writeFileSync(`${hardhatConfigPath}.backup`, originalConfig);
    
    // Create a new config with the correct settings
    const newConfig = `
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "istanbul",
      viaIR: true
    }
  },
  networks: {
    studio: {
      url: "https://mainnet.studio-blockchain.com",
      accounts: ["86d120d242ea32fa4ac72d9b2147ba3cd871158ed5f8353e98838bc13d24fcee"],
      chainId: 240241
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
    `;
    
    // Write the new config
    fs.writeFileSync(hardhatConfigPath, newConfig);
    
    // Verify the contract
    await hre.run("verify:verify", {
      address: bridgeAddress,
      constructorArguments: constructorArgs,
      contract: "contracts/Bridge.sol:Bridge"
    });
    
    console.log(`✅ Bridge contract verified successfully!`);
  } catch (error) {
    console.log(`❌ Error verifying Bridge contract: ${error.message}`);
  } finally {
    // Restore the original hardhat.config.js
    const hardhatConfigPath = path.resolve(__dirname, '../hardhat.config.js');
    const backupPath = `${hardhatConfigPath}.backup`;
    
    if (fs.existsSync(backupPath)) {
      const originalConfig = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(hardhatConfigPath, originalConfig);
      fs.unlinkSync(backupPath);
      console.log('Restored original hardhat.config.js');
    }
  }
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
