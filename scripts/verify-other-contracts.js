const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// API endpoint for contract verification
const API_ENDPOINT = 'https://mainnetindexer.studio-blockchain.com/contracts/verify';

// Load deployment info
const STUDIO_DEPLOYMENT_PATH = path.resolve(__dirname, '../studio-deployment.json');
const studioDeploymentData = JSON.parse(fs.readFileSync(STUDIO_DEPLOYMENT_PATH, 'utf8'));

// Contract addresses
const rateLimiterAddress = studioDeploymentData.rateLimiter;
const bridgeAddress = studioDeploymentData.bridge;
const erc20HandlerFixedAddress = studioDeploymentData.erc20HandlerFixed;
const nativeHandlerAddress = studioDeploymentData.nativeHandler;

// Constructor arguments
const erc20HandlerFixedArgs = [
  bridgeAddress, // Bridge address
  100 // Fee percentage (1%)
];

const nativeHandlerArgs = [
  bridgeAddress, // Bridge address
  100 // Fee percentage (1%)
];

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

// Function to try direct API verification
async function tryDirectApiVerification(contractName, address, constructorArgs, version, evmVersion, optimizerRuns) {
  console.log(`\nTrying direct API verification for ${contractName} with solc version ${version}, EVM version ${evmVersion}, optimizer runs ${optimizerRuns}...`);
  
  try {
    // Get the flattened source code
    console.log(`Flattening the ${contractName} contract...`);
    const contractPath = `contracts/${contractName}.sol`;
    const outputPath = `flattened/${contractName}.sol`;
    
    // Create flattened directory if it doesn't exist
    if (!fs.existsSync('flattened')) {
      fs.mkdirSync('flattened');
    }
    
    // Use hardhat to flatten the contract
    const { execSync } = require('child_process');
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
    const abiCoder = new ethers.AbiCoder();
    
    let encodedArgs = '';
    if (constructorArgs && constructorArgs.length > 0) {
      // Define the types based on the constructor arguments
      const types = [];
      for (const arg of constructorArgs) {
        if (typeof arg === 'number') {
          types.push('uint256');
        } else if (typeof arg === 'string' && arg.startsWith('0x')) {
          types.push('address');
        } else if (Array.isArray(arg)) {
          types.push('address[]');
        } else {
          types.push('string');
        }
      }
      
      encodedArgs = abiCoder.encode(types, constructorArgs).substring(2); // Remove '0x' prefix
    }
    
    // Use the API endpoint directly
    const requestData = {
      address: address,
      sourceCode: flattenedSourceCode,
      compilerVersion: version,
      contractName: contractName,
      optimizationUsed: true,
      runs: optimizerRuns,
      constructorArguments: encodedArgs,
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
      console.log(`✅ Successfully verified ${contractName} with direct API call!`);
      return true;
    } else {
      console.log(`❌ Failed to verify ${contractName} with direct API call: ${response.data.error}`);
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
  // Try to verify RateLimiter
  console.log(`\nVerifying RateLimiter contract at ${rateLimiterAddress}...`);
  
  // Check if contract is already verified
  const isRateLimiterVerified = await isContractVerified(rateLimiterAddress);
  if (isRateLimiterVerified) {
    console.log(`RateLimiter contract at ${rateLimiterAddress} is already verified.`);
  } else {
    // Try to verify RateLimiter
    const rateLimiterSuccess = await tryDirectApiVerification('RateLimiter', rateLimiterAddress, [], '0.8.0', 'istanbul', 200);
    if (!rateLimiterSuccess) {
      console.log(`Failed to verify RateLimiter contract.`);
    }
  }
  
  // Try to verify ERC20HandlerFixed
  console.log(`\nVerifying ERC20HandlerFixed contract at ${erc20HandlerFixedAddress}...`);
  
  // Check if contract is already verified
  const isERC20HandlerFixedVerified = await isContractVerified(erc20HandlerFixedAddress);
  if (isERC20HandlerFixedVerified) {
    console.log(`ERC20HandlerFixed contract at ${erc20HandlerFixedAddress} is already verified.`);
  } else {
    // Try to verify ERC20HandlerFixed
    const erc20HandlerFixedSuccess = await tryDirectApiVerification('ERC20HandlerFixed', erc20HandlerFixedAddress, erc20HandlerFixedArgs, '0.8.0', 'istanbul', 200);
    if (!erc20HandlerFixedSuccess) {
      console.log(`Failed to verify ERC20HandlerFixed contract.`);
    }
  }
  
  // Try to verify NativeHandler
  console.log(`\nVerifying NativeHandler contract at ${nativeHandlerAddress}...`);
  
  // Check if contract is already verified
  const isNativeHandlerVerified = await isContractVerified(nativeHandlerAddress);
  if (isNativeHandlerVerified) {
    console.log(`NativeHandler contract at ${nativeHandlerAddress} is already verified.`);
  } else {
    // Try to verify NativeHandler
    const nativeHandlerSuccess = await tryDirectApiVerification('NativeHandler', nativeHandlerAddress, nativeHandlerArgs, '0.8.0', 'istanbul', 200);
    if (!nativeHandlerSuccess) {
      console.log(`Failed to verify NativeHandler contract.`);
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
