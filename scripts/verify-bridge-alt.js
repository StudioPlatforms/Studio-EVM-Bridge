const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load deployment info
const STUDIO_DEPLOYMENT_PATH = path.resolve(__dirname, '../studio-deployment.json');
const studioDeploymentData = JSON.parse(fs.readFileSync(STUDIO_DEPLOYMENT_PATH, 'utf8'));

// Bridge contract address
const bridgeAddress = studioDeploymentData.bridge;

// Constructor arguments
const chainId = 240241;
const initialRelayers = ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"];
const relayerThreshold = 1;

// Try different formats for the constructor arguments
async function tryVerifyWithDifferentFormats() {
  console.log('Trying different formats for constructor arguments...');
  
  // Format 1: Separate arguments
  try {
    console.log('\nTrying format 1: Separate arguments');
    execSync(`npx hardhat verify --network studio ${bridgeAddress} ${chainId} ${JSON.stringify(initialRelayers)} ${relayerThreshold}`, { stdio: 'inherit' });
    console.log('✅ Successfully verified with format 1!');
    return true;
  } catch (error) {
    console.log('❌ Failed to verify with format 1');
  }
  
  // Format 2: JSON string for array
  try {
    console.log('\nTrying format 2: JSON string for array');
    execSync(`npx hardhat verify --network studio ${bridgeAddress} ${chainId} '${JSON.stringify(initialRelayers)}' ${relayerThreshold}`, { stdio: 'inherit' });
    console.log('✅ Successfully verified with format 2!');
    return true;
  } catch (error) {
    console.log('❌ Failed to verify with format 2');
  }
  
  // Format 3: Comma-separated list for array
  try {
    console.log('\nTrying format 3: Comma-separated list for array');
    execSync(`npx hardhat verify --network studio ${bridgeAddress} ${chainId} ${initialRelayers.join(',')} ${relayerThreshold}`, { stdio: 'inherit' });
    console.log('✅ Successfully verified with format 3!');
    return true;
  } catch (error) {
    console.log('❌ Failed to verify with format 3');
  }
  
  // Format 4: Using a temporary script
  try {
    console.log('\nTrying format 4: Using a temporary script');
    
    // Create a temporary script
    const tempScriptPath = path.resolve(__dirname, '../verify-bridge-temp.js');
    const scriptContent = `
      const hre = require("hardhat");
      
      async function main() {
        await hre.run("verify:verify", {
          address: "${bridgeAddress}",
          constructorArguments: [
            ${chainId},
            ${JSON.stringify(initialRelayers)},
            ${relayerThreshold}
          ],
        });
      }
      
      main()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
    `;
    
    fs.writeFileSync(tempScriptPath, scriptContent);
    
    // Run the temporary script
    execSync(`npx hardhat run ${tempScriptPath} --network studio`, { stdio: 'inherit' });
    
    // Clean up
    fs.unlinkSync(tempScriptPath);
    
    console.log('✅ Successfully verified with format 4!');
    return true;
  } catch (error) {
    console.log('❌ Failed to verify with format 4');
    
    // Clean up
    const tempScriptPath = path.resolve(__dirname, '../verify-bridge-temp.js');
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
  
  // Format 5: Using the API directly
  try {
    console.log('\nTrying format 5: Using the API directly');
    
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
    
    // Create a temporary script to use the API directly
    const tempScriptPath = path.resolve(__dirname, '../verify-bridge-api.js');
    const scriptContent = `
      const axios = require('axios');
      const fs = require('fs');
      const path = require('path');
      const { ethers } = require('hardhat');
      
      async function main() {
        // Read the flattened source code
        const flattenedSourceCode = fs.readFileSync('${outputPath}', 'utf8');
        
        // Encode constructor arguments
        const abiCoder = new ethers.AbiCoder();
        const encodedArgs = abiCoder.encode(
          ['uint256', 'address[]', 'uint256'],
          [${chainId}, ${JSON.stringify(initialRelayers)}, ${relayerThreshold}]
        ).substring(2); // Remove '0x' prefix
        
        // Use the API endpoint directly
        const API_ENDPOINT = 'https://mainnetindexer.studio-blockchain.com/contracts/verify';
        
        const requestData = {
          address: "${bridgeAddress}",
          sourceCode: flattenedSourceCode,
          compilerVersion: '0.8.0',
          contractName: 'Bridge',
          optimizationUsed: true,
          runs: 200,
          constructorArguments: encodedArgs,
          evmVersion: 'istanbul'
        };
        
        console.log('Sending direct API verification request...');
        
        const response = await axios.post(API_ENDPOINT, requestData, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Response status:', response.status);
        console.log('Response data:', JSON.stringify(response.data, null, 2));
        
        if (response.data.success) {
          console.log('✅ Successfully verified with direct API call!');
        } else {
          console.log('❌ Failed to verify with direct API call:', response.data.error);
        }
      }
      
      main()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
    `;
    
    fs.writeFileSync(tempScriptPath, scriptContent);
    
    // Run the temporary script
    execSync(`npx hardhat run ${tempScriptPath} --network studio`, { stdio: 'inherit' });
    
    // Clean up
    fs.unlinkSync(tempScriptPath);
    
    console.log('✅ Successfully verified with format 5!');
    return true;
  } catch (error) {
    console.log('❌ Failed to verify with format 5');
    
    // Clean up
    const tempScriptPath = path.resolve(__dirname, '../verify-bridge-api.js');
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
  
  return false;
}

// Main function
async function main() {
  const success = await tryVerifyWithDifferentFormats();
  
  if (!success) {
    console.log('\n❌ All verification attempts failed.');
  }
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
