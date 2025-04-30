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

// Function to compile the Bridge contract using solc
async function compileBridgeContract() {
  console.log('Compiling Bridge contract using solc...');
  
  // Read contract sources
  const contractsDir = path.resolve(__dirname, '../contracts');
  
  const sources = {
    'Bridge.sol': {
      content: fs.readFileSync(path.join(contractsDir, 'Bridge.sol'), 'utf8')
    },
    'interfaces/IBridge.sol': {
      content: fs.readFileSync(path.join(contractsDir, 'interfaces/IBridge.sol'), 'utf8')
    },
    'interfaces/IHandler.sol': {
      content: fs.readFileSync(path.join(contractsDir, 'interfaces/IHandler.sol'), 'utf8')
    },
    'interfaces/IERC20.sol': {
      content: fs.readFileSync(path.join(contractsDir, 'interfaces/IERC20.sol'), 'utf8')
    },
    'security/Ownable.sol': {
      content: fs.readFileSync(path.join(contractsDir, 'security/Ownable.sol'), 'utf8')
    },
    'security/Pausable.sol': {
      content: fs.readFileSync(path.join(contractsDir, 'security/Pausable.sol'), 'utf8')
    },
    'security/ReentrancyGuard.sol': {
      content: fs.readFileSync(path.join(contractsDir, 'security/ReentrancyGuard.sol'), 'utf8')
    }
  };
  
  // Configure compiler input
  const input = {
    language: 'Solidity',
    sources: sources,
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      },
      optimizer: {
        enabled: true,
        runs: 200
      },
      // viaIR is not supported in solc 0.8.0
      evmVersion: "istanbul"
    }
  };
  
  // Compile contract
  console.log('Compiling with solc...');
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  // Check for errors
  if (output.errors) {
    output.errors.forEach(error => {
      console.error(error.formattedMessage);
    });
    
    // Only throw if there are severe errors
    if (output.errors.some(error => error.severity === 'error')) {
      throw new Error('Compilation failed');
    }
  }
  
  console.log('Bridge contract compiled successfully');
  
  return output.contracts['Bridge.sol'].Bridge;
}

// Function to encode constructor arguments
function encodeConstructorArgs(abi, args) {
  // Find the constructor ABI
  const constructorAbi = abi.find(item => item.type === 'constructor');
  
  if (!constructorAbi) {
    throw new Error('Constructor ABI not found');
  }
  
  // Encode the constructor arguments
  const types = constructorAbi.inputs.map(input => input.type);
  const values = args;
  
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
    
    // Compile the Bridge contract
    const compiledContract = await compileBridgeContract();
    
    // Get the ABI and bytecode
    const abi = compiledContract.abi;
    const bytecode = compiledContract.evm.bytecode.object;
    
    // Encode constructor arguments
    const encodedArgs = encodeConstructorArgs(abi, constructorArgs);
    console.log('Constructor arguments:', constructorArgs);
    console.log('Encoded constructor arguments:', encodedArgs);
    
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
      evmVersion: 'istanbul'
      // viaIR is not supported in solc 0.8.0
    };
    
    console.log(`Sending verification request for Bridge with istanbul EVM version...`);
    
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
