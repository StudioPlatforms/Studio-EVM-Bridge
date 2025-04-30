const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers, run } = require('hardhat');
const { execSync } = require('child_process');

// API endpoint for contract verification
const API_ENDPOINT = 'https://mainnetindexer.studio-blockchain.com/contracts/verify';

// Load deployment info
const STUDIO_DEPLOYMENT_PATH = path.resolve(__dirname, '../studio-deployment.json');
const PRESALE_DEPLOYMENT_PATH = path.resolve(__dirname, '../presale-deployment.json');

const studioDeploymentData = JSON.parse(fs.readFileSync(STUDIO_DEPLOYMENT_PATH, 'utf8'));
const presaleDeploymentData = JSON.parse(fs.readFileSync(PRESALE_DEPLOYMENT_PATH, 'utf8'));

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
  'RateLimiter': path.resolve(__dirname, '../contracts/RateLimiter.sol'),
  'Bridge': path.resolve(__dirname, '../contracts/Bridge.sol'),
  'ERC20HandlerFixed': path.resolve(__dirname, '../contracts/ERC20HandlerFixed.sol'),
  'NativeHandler': path.resolve(__dirname, '../contracts/NativeHandler.sol'),
  'StudioPresale': path.resolve(__dirname, '../contracts/presale/StudioPresale.sol'),
  'STORecovery': path.resolve(__dirname, '../contracts/presale/STORecovery.sol')
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

// Function to flatten a contract using Hardhat
async function flattenContract(contractPath, outputPath) {
  console.log(`Flattening ${contractPath} to ${outputPath}...`);
  
  try {
    // Create the flattened directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Flatten the contract using Hardhat's built-in flattener
    const command = `npx hardhat flatten ${contractPath} > ${outputPath}`;
    execSync(command, { encoding: 'utf8' });
    
    console.log(`Successfully flattened ${contractPath}`);
    
    // Read the flattened file
    const flattenedCode = fs.readFileSync(outputPath, 'utf8');
    
    // Remove duplicate SPDX license identifiers and pragma statements
    const cleanedCode = removeDuplicatePragmaAndLicense(flattenedCode);
    
    // Write the cleaned code back to the file
    fs.writeFileSync(outputPath, cleanedCode);
    
    return cleanedCode;
  } catch (error) {
    console.error(`Error flattening contract: ${error.message}`);
    throw error;
  }
}

// Function to remove duplicate SPDX license identifiers and pragma statements
function removeDuplicatePragmaAndLicense(source) {
  const pragmaPattern = /\/\/ SPDX-License-Identifier: .+|\/\/ pragma solidity .+/g;
  const pragmaSolidityPattern = /pragma solidity .+?;/g;
  
  // Find all pragma and license statements
  const pragmaMatches = source.match(pragmaSolidityPattern) || [];
  
  // Keep only the first occurrence of each unique pragma
  const uniquePragmas = [...new Set(pragmaMatches)];
  
  // Remove all pragma statements
  let cleanedSource = source.replace(pragmaSolidityPattern, '');
  
  // Add back the unique pragmas at the top
  cleanedSource = uniquePragmas.join('\n') + '\n\n' + cleanedSource;
  
  // Remove duplicate SPDX license identifiers
  const licensePattern = /\/\/ SPDX-License-Identifier: .+\n/g;
  const licenseMatches = source.match(licensePattern) || [];
  
  if (licenseMatches.length > 0) {
    // Keep only the first license
    const firstLicense = licenseMatches[0];
    cleanedSource = cleanedSource.replace(licensePattern, '');
    cleanedSource = firstLicense + cleanedSource;
  }
  
  return cleanedSource;
}

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
async function verifyContract(contractName) {
  try {
    const address = contractAddresses[contractName];
    console.log(`Verifying ${contractName} contract at ${address}...`);
    
    // Check if contract is already verified
    const isVerified = await isContractVerified(address);
    if (isVerified) {
      console.log(`${contractName} contract at ${address} is already verified.`);
      return;
    }
    
    // Flatten the contract
    const outputPath = path.resolve(__dirname, `../flattened/${contractName}.sol`);
    const flattenedSourceCode = await flattenContract(contractPaths[contractName], outputPath);
    
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
  
  // Verify bridge contracts
  await verifyContract('RateLimiter');
  await verifyContract('Bridge');
  await verifyContract('ERC20HandlerFixed');
  await verifyContract('NativeHandler');
  
  // Verify presale contracts
  await verifyContract('StudioPresale');
  await verifyContract('STORecovery');
  
  console.log('Contract verification process completed!');
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
