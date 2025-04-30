const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('hardhat');
const { execSync } = require('child_process');

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
    
    // Create flattened directory if it doesn't exist
    if (!fs.existsSync('flattened')) {
      fs.mkdirSync('flattened');
    }
    
    // Flatten the contract
    const contractPath = 'contracts/Bridge.sol';
    const outputPath = 'flattened/Bridge.sol';
    console.log(`Flattening ${contractPath} to ${outputPath}...`);
    
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
    const contractFactory = await ethers.getContractFactory('Bridge');
    const encodedArgs = contractFactory.interface.encodeDeploy(constructorArgs);
    
    console.log('Constructor arguments:', constructorArgs);
    console.log('Encoded constructor arguments:', encodedArgs);
    
    // Use the exact compiler settings from the deployment script
    console.log('\nTrying with the exact deployment settings...');
    
    // Use the correct EVM version and viaIR setting
    const requestData = {
      address: bridgeAddress,
      sourceCode: flattenedSourceCode,
      compilerVersion: '0.8.0',
      contractName: 'Bridge',
      optimizationUsed: true,
      runs: 200,
      constructorArguments: encodedArgs,
      evmVersion: 'london',
      viaIR: true
    };
    
    console.log(`Sending verification request for Bridge with london EVM version and viaIR...`);
    
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
      }
    } catch (error) {
      console.log(`❌ Error verifying Bridge contract: ${error.message}`);
      if (error.response) {
        console.log(`Response status: ${error.response.status}`);
        console.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }
    
    console.log('\nTrying with standard Hardhat verify command...');
    
    // Try using the standard Hardhat verify command
    try {
      const command = `npx hardhat verify --network studio ${bridgeAddress} ${constructorArgs.join(' ')}`;
      console.log(`Executing: ${command}`);
      
      const output = execSync(command, { encoding: 'utf8' });
      console.log(output);
    } catch (error) {
      console.error(`Error executing Hardhat verify command: ${error.message}`);
      if (error.stdout) console.log(error.stdout);
      if (error.stderr) console.error(error.stderr);
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
  // Install axios if not already installed
  try {
    require.resolve('axios');
  } catch (error) {
    console.log('Installing axios...');
    require('child_process').execSync('npm install axios');
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
