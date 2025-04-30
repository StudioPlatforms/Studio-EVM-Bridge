const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');
require('dotenv').config();

// Load deployment info
const STUDIO_DEPLOYMENT_PATH = path.resolve(__dirname, '../studio-deployment.json');
const studioDeploymentData = JSON.parse(fs.readFileSync(STUDIO_DEPLOYMENT_PATH, 'utf8'));

// Bridge contract address
const bridgeAddress = studioDeploymentData.bridge;

// Constructor arguments
const constructorArgs = [
  240241, // Chain ID
  ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"], // Initial relayers
  1 // Relayer threshold
];

// Function to verify the Bridge contract with a specific solc version
async function verifyWithSolcVersion(version) {
  console.log(`\nTrying to verify with solc version ${version}...`);
  
  try {
    // Install the specific solc version
    console.log(`Installing solc version ${version}...`);
    execSync(`npm install solc@${version}`);
    
    // Create a temporary hardhat config file with the specific solc version
    const tempConfigPath = path.resolve(__dirname, '../hardhat.temp.config.js');
    const configContent = `
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "${version}",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "istanbul"
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
      studio: "dummy"
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
    
    fs.writeFileSync(tempConfigPath, configContent);
    
    // Try to verify using the temporary config
    console.log(`Verifying with solc version ${version}...`);
    try {
      execSync(`npx hardhat verify --config hardhat.temp.config.js --network studio ${bridgeAddress} 240241 ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"] 1`, { stdio: 'inherit' });
      console.log(`✅ Successfully verified with solc version ${version}!`);
      return true;
    } catch (error) {
      console.log(`❌ Failed to verify with solc version ${version}`);
      return false;
    } finally {
      // Clean up the temporary config file
      fs.unlinkSync(tempConfigPath);
    }
  } catch (error) {
    console.error(`Error with solc version ${version}:`, error.message);
    return false;
  }
}

// Function to try direct API verification
async function tryDirectApiVerification(version, evmVersion, optimizerRuns) {
  console.log(`\nTrying direct API verification with solc version ${version}, EVM version ${evmVersion}, optimizer runs ${optimizerRuns}...`);
  
  try {
    // Get the flattened source code
    console.log('Flattening the Bridge contract...');
    const contractPath = 'contracts/Bridge.sol';
    const outputPath = 'flattened/Bridge.sol';
    
    // Create flattened directory if it doesn't exist
    if (!fs.existsSync('flattened')) {
      fs.mkdirSync('flattened');
    }
    
    // Use hardhat to flatten the contract
    execSync(`npx hardhat flatten ${contractPath} > ${outputPath}`);
    console.log(`Successfully flattened ${contractPath}`);
    
    // Read the flattened file
    let flattenedSourceCode = fs.readFileSync(outputPath, 'utf8');
    
    // Clean up duplicate SPDX license identifiers and pragma statements
    const licensePattern = /\/\/ SPDX-License-Identifier: .+\n/g;
    const licenseMatches = flattenedSourceCode.match(licensePattern) || [];
    
    if (licenseMatches.length > 0) {
      // Keep only the first license
      const firstLicense = licenseMatches[0];
      flattenedSourceCode = flattenedSourceCode.replace(licensePattern, '');
      flattenedSourceCode = firstLicense + flattenedSourceCode;
    }
    
    // Clean up duplicate pragma statements
    const pragmaPattern = /pragma solidity .+?;/g;
    const pragmaMatches = flattenedSourceCode.match(pragmaPattern) || [];
    
    if (pragmaMatches.length > 0) {
      // Keep only the first pragma
      const firstPragma = pragmaMatches[0];
      flattenedSourceCode = flattenedSourceCode.replace(pragmaPattern, '');
      flattenedSourceCode = firstPragma + '\n\n' + flattenedSourceCode;
    }
    
    // Write the cleaned code back to the file
    fs.writeFileSync(outputPath, flattenedSourceCode);
    
    // Encode constructor arguments
    const { ethers } = require('hardhat');
    const types = ['uint256', 'address[]', 'uint256'];
    const abiCoder = new ethers.AbiCoder();
    const encodedArgs = abiCoder.encode(types, constructorArgs);
    
    // Use the API endpoint directly
    const API_ENDPOINT = 'https://mainnetindexer.studio-blockchain.com/contracts/verify';
    
    const requestData = {
      address: bridgeAddress,
      sourceCode: flattenedSourceCode,
      compilerVersion: version,
      contractName: 'Bridge',
      optimizationUsed: true,
      runs: optimizerRuns,
      constructorArguments: encodedArgs.substring(2), // Remove '0x' prefix
      evmVersion: evmVersion
    };
    
    console.log(`Sending direct API verification request...`);
    
    const response = await axios.post(API_ENDPOINT, requestData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response data: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.data.success) {
      console.log(`✅ Successfully verified with direct API call!`);
      return true;
    } else {
      console.log(`❌ Failed to verify with direct API call: ${response.data.error}`);
      return false;
    }
  } catch (error) {
    console.error(`Error with direct API verification:`, error.message);
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

// Main function
async function main() {
  // Try different solc versions
  const solcVersions = ['0.8.0', '0.8.1', '0.8.2', '0.8.3', '0.8.4', '0.8.5'];
  
  for (const version of solcVersions) {
    const success = await verifyWithSolcVersion(version);
    if (success) {
      console.log(`\n✅ Successfully verified with solc version ${version}!`);
      return;
    }
  }
  
  console.log('\nFailed to verify with standard Hardhat verify. Trying direct API verification...');
  
  // Try direct API verification with different combinations
  const solcVersions2 = ['0.8.0', '0.8.1', '0.8.2', '0.8.3', '0.8.4', '0.8.5'];
  const evmVersions = ['istanbul', 'berlin', 'petersburg', 'constantinople'];
  const optimizerRuns = [200, 100, 300];
  
  for (const version of solcVersions2) {
    for (const evmVersion of evmVersions) {
      for (const runs of optimizerRuns) {
        const success = await tryDirectApiVerification(version, evmVersion, runs);
        if (success) {
          console.log(`\n✅ Successfully verified with solc version ${version}, EVM version ${evmVersion}, optimizer runs ${runs}!`);
          return;
        }
      }
    }
  }
  
  console.log('\n❌ All verification attempts failed.');
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
