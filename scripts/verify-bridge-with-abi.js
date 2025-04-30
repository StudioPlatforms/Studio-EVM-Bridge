const fs = require('fs');
const path = require('path');
const axios = require('axios');
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

// Function to verify the Bridge contract using the ABI and bytecode
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
    
    // Load the ABI and bytecode from the artifacts
    const artifactPath = path.resolve(__dirname, '../artifacts/contracts/Bridge.sol/Bridge.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    // Encode constructor arguments
    const { ethers } = require('hardhat');
    const abiCoder = new ethers.AbiCoder();
    const types = ['uint256', 'address[]', 'uint256'];
    const encodedArgs = abiCoder.encode(types, constructorArgs).substring(2); // Remove '0x' prefix
    
    // Use the API endpoint directly
    const requestData = {
      address: bridgeAddress,
      sourceCode: flattenedSourceCode,
      compilerVersion: '0.8.0',
      contractName: 'Bridge',
      optimizationUsed: true,
      runs: 200,
      constructorArguments: encodedArgs,
      evmVersion: 'istanbul',
      abi: JSON.stringify(artifact.abi),
      bytecode: artifact.bytecode.substring(2) // Remove '0x' prefix
    };
    
    console.log(`Sending verification request with ABI and bytecode...`);
    
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
        console.log(`✅ Bridge contract verified successfully!`);
        return; // Exit the function if verification is successful
      } else {
        console.log(`❌ Error verifying Bridge contract: ${response.data.error}`);
        
        // Try with different EVM versions
        const evmVersions = ['london', 'berlin', 'petersburg', 'constantinople', 'byzantium'];
        
        for (const evmVersion of evmVersions) {
          if (evmVersion === 'istanbul') continue; // Skip istanbul as we already tried it
          
          console.log(`\nTrying with EVM version: ${evmVersion}`);
          
          requestData.evmVersion = evmVersion;
          
          try {
            const response = await axios.post(API_ENDPOINT, requestData, {
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`Response status: ${response.status}`);
            console.log(`Response data: ${JSON.stringify(response.data, null, 2)}`);
            
            if (response.data.success) {
              console.log(`✅ Bridge contract verified successfully with ${evmVersion} EVM version!`);
              return; // Exit the function if verification is successful
            } else {
              console.log(`❌ Error verifying Bridge contract with ${evmVersion} EVM version: ${response.data.error}`);
            }
          } catch (error) {
            console.log(`❌ Error verifying Bridge contract with ${evmVersion} EVM version: ${error.message}`);
            if (error.response) {
              console.log(`Response status: ${error.response.status}`);
              console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
            }
          }
        }
      }
    } catch (error) {
      console.log(`❌ Error verifying Bridge contract: ${error.message}`);
      if (error.response) {
        console.log(`Response status: ${error.response.status}`);
        console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
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
