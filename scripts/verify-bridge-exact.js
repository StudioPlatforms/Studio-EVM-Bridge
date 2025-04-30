const fs = require('fs');
const path = require('path');
const axios = require('axios');
const solc = require('solc');
require('dotenv').config();

// API endpoint for contract verification
const API_ENDPOINT = 'https://mainnetindexer.studio-blockchain.com/contracts/verify';

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

// Function to encode constructor arguments
function encodeConstructorArgs(types, values) {
  // Use ethers.js to encode the constructor arguments
  const { ethers } = require('ethers');
  const abiCoder = new ethers.AbiCoder();
  return abiCoder.encode(types, values);
}

// Function to verify the Bridge contract
async function verifyBridgeContract() {
  try {
    console.log(`Verifying Bridge contract at ${bridgeAddress}...`);
    
    // Check if contract is already verified
    const isVerified = await isContractVerified(bridgeAddress);
    if (isVerified) {
      console.log(`Bridge contract at ${bridgeAddress} is already verified.`);
      return;
    }
    
    // Get the flattened source code
    console.log('Flattening the Bridge contract...');
    const contractPath = 'contracts/Bridge.sol';
    const outputPath = 'flattened/Bridge.sol';
    
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
    const types = ['uint256', 'address[]', 'uint256'];
    const encodedArgs = encodeConstructorArgs(types, constructorArgs);
    console.log('Constructor arguments:', constructorArgs);
    console.log('Encoded constructor arguments:', encodedArgs);
    
    // Use the exact compiler settings from the deployment script
    console.log('\nSending verification request with the exact deployment settings...');
    
    // Use the correct EVM version and viaIR setting
    const requestData = {
      address: bridgeAddress,
      sourceCode: flattenedSourceCode,
      compilerVersion: '0.8.0',
      contractName: 'Bridge',
      optimizationUsed: true,
      runs: 200,
      constructorArguments: encodedArgs.substring(2), // Remove '0x' prefix
      evmVersion: 'london',
      viaIR: true
    };
    
    // Try with different EVM versions and viaIR settings
    const evmVersions = ['london', 'istanbul', 'berlin', 'petersburg', 'constantinople', 'byzantium'];
    const viaIRSettings = [true, false];
    
    let success = false;
    
    for (const viaIR of viaIRSettings) {
      for (const evmVersion of evmVersions) {
        if (success) continue; // Skip if already successful
        
        console.log(`\nTrying with EVM version: ${evmVersion}, viaIR: ${viaIR}`);
        
        requestData.evmVersion = evmVersion;
        requestData.viaIR = viaIR;
        
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
            console.log(`✅ Bridge contract verified successfully with EVM version ${evmVersion} and viaIR ${viaIR}!`);
            success = true;
          } else {
            console.log(`❌ Error verifying Bridge contract: ${response.data.error}`);
          }
        } catch (error) {
          console.log(`❌ Error verifying Bridge contract: ${error.message}`);
          if (error.response) {
            console.log(`Response status: ${error.response.status}`);
            console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
          }
        }
      }
    }
    
    if (!success) {
      console.log('\nAll verification attempts failed.');
    }
  } catch (error) {
    console.log(`❌ Error verifying Bridge contract: ${error.message}`);
    if (error.response) {
      console.log(`Response status: ${error.response.status}`);
      console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

// Main function
async function main() {
  // Install required packages if not already installed
  try {
    require.resolve('axios');
  } catch (error) {
    console.log('Installing axios...');
    require('child_process').execSync('npm install axios');
  }
  
  try {
    require.resolve('solc');
  } catch (error) {
    console.log('Installing solc...');
    require('child_process').execSync('npm install solc');
  }
  
  // Verify the Bridge contract
  await verifyBridgeContract();
  
  console.log('Bridge contract verification process completed!');
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
