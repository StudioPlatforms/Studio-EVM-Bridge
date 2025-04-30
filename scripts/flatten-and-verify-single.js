const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('hardhat');
const { execSync } = require('child_process');

// API endpoint for contract verification
const API_ENDPOINT = 'https://mainnetindexer.studio-blockchain.com/contracts/verify';

// Load deployment info
const STUDIO_DEPLOYMENT_PATH = path.resolve(__dirname, '../studio-deployment.json');
const PRESALE_DEPLOYMENT_PATH = path.resolve(__dirname, '../presale-deployment.json');

const studioDeploymentData = JSON.parse(fs.readFileSync(STUDIO_DEPLOYMENT_PATH, 'utf8'));
const presaleDeploymentData = JSON.parse(fs.readFileSync(PRESALE_DEPLOYMENT_PATH, 'utf8'));

// Get contract name from environment variable
const contractName = process.env.CONTRACT_NAME;
if (!contractName) {
  console.error('Please provide a CONTRACT_NAME environment variable');
  process.exit(1);
}
console.log(`Contract name: ${contractName}`);

// Contract addresses
const contractAddresses = {
  'RateLimiter': studioDeploymentData.rateLimiter,
  'Bridge': studioDeploymentData.bridge,
  'ERC20HandlerFixed': studioDeploymentData.erc20HandlerFixed,
  'NativeHandler': studioDeploymentData.nativeHandler,
  'StudioPresale': presaleDeploymentData.presale,
  'STORecovery': presaleDeploymentData.recovery
};

// Contract paths
const contractPaths = {
  'RateLimiter': 'contracts/RateLimiter.sol',
  'Bridge': 'contracts/Bridge.sol',
  'ERC20HandlerFixed': 'contracts/ERC20HandlerFixed.sol',
  'NativeHandler': 'contracts/NativeHandler.sol',
  'StudioPresale': 'contracts/presale/StudioPresale.sol',
  'STORecovery': 'contracts/presale/STORecovery.sol'
};

// Constructor arguments
const constructorArgs = {
  'RateLimiter': [],
  'Bridge': [
    240241, // Chain ID
    ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"], // Initial relayers
    1 // Relayer threshold
  ],
  'ERC20HandlerFixed': [
    studioDeploymentData.bridge, // Bridge address
    100 // Fee percentage (1%)
  ],
  'NativeHandler': [
    studioDeploymentData.bridge, // Bridge address
    100 // Fee percentage (1%)
  ],
  'StudioPresale': [
    presaleDeploymentData.usdt, // USDT token address
    presaleDeploymentData.baseTokenPrice, // Base token price
    presaleDeploymentData.minPurchaseAmount, // Minimum purchase amount
    presaleDeploymentData.targetRaiseAmount, // Target raise amount
    presaleDeploymentData.totalTokensAllocated // Total tokens allocated
  ],
  'STORecovery': []
};

// Function to check if a contract is verified
async function isContractVerified(address) {
  try {
    const response = await axios.get(`https://mainnetindexer.studio-blockchain.com/contracts/${address}/verified`);
    return response.data.verified;
  } catch (error) {
    console.error(`Error checking if contract ${address} is verified:`, error.response ? error.response.data : error.message);
    return false;
  }
}

// Function to verify a contract
async function verifyContract() {
  try {
    const address = contractAddresses[contractName];
    console.log(`Verifying ${contractName} contract at ${address}...`);
    
    // Check if contract is already verified
    const isVerified = await isContractVerified(address);
    if (isVerified) {
      console.log(`${contractName} contract at ${address} is already verified.`);
      return;
    }
    
    // Create flattened directory if it doesn't exist
    if (!fs.existsSync('flattened')) {
      fs.mkdirSync('flattened');
    }
    
    // Flatten the contract
    const outputPath = `flattened/${contractName}.sol`;
    console.log(`Flattening ${contractPaths[contractName]} to ${outputPath}...`);
    
    // Use hardhat to flatten the contract
    execSync(`npx hardhat flatten ${contractPaths[contractName]} > ${outputPath}`);
    console.log(`Successfully flattened ${contractPaths[contractName]}`);
    
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
    let encodedArgs = '';
    if (constructorArgs[contractName].length > 0) {
      // Create a contract factory to encode the constructor arguments
      const contractFactory = await ethers.getContractFactory(contractName);
      encodedArgs = contractFactory.interface.encodeDeploy(constructorArgs[contractName]);
    }
    
    // Use the correct EVM version for Solidity 0.8.0
    const requestData = {
      address: address,
      sourceCode: flattenedSourceCode,
      compilerVersion: '0.8.0',
      contractName: contractName,
      optimizationUsed: true,
      runs: 200,
      constructorArguments: encodedArgs,
      evmVersion: 'istanbul' // Correct EVM version for Solidity 0.8.0
    };
    
    console.log(`Sending verification request for ${contractName} with istanbul EVM version...`);
    
    try {
      // Send the request
      const response = await axios.post(API_ENDPOINT, requestData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Response status: ${response.status}`);
      console.log(`Response data: ${JSON.stringify(response.data, null, 2)}`);
      
      if (response.data.success) {
        console.log(`✅ ${contractName} contract verified successfully!`);
      } else {
        console.log(`❌ Error verifying ${contractName} contract: ${response.data.error}`);
      }
    } catch (error) {
      console.log(`❌ Error verifying ${contractName} contract: ${error.message}`);
      if (error.response) {
        console.log(`Response status: ${error.response.status}`);
        console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }
  } catch (error) {
    console.log(`❌ Error verifying ${contractName} contract: ${error.message}`);
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

// Main function
async function main() {
  // Install axios if not already installed
  try {
    require.resolve('axios');
  } catch (error) {
    console.log('Installing axios...');
    require('child_process').execSync('npm install axios');
  }
  
  // Verify the contract
  await verifyContract();
  
  console.log('Contract verification process completed!');
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
