const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('hardhat');

// Configuration
const API_URL = 'https://mainnetindexer.studio-blockchain.com/contracts/verify';
const STUDIO_DEPLOYMENT_PATH = path.resolve(__dirname, '../studio-deployment.json');
const PRESALE_DEPLOYMENT_PATH = path.resolve(__dirname, '../presale-deployment.json');

// Load deployment data
const studioDeploymentData = JSON.parse(fs.readFileSync(STUDIO_DEPLOYMENT_PATH, 'utf8'));
const presaleDeploymentData = JSON.parse(fs.readFileSync(PRESALE_DEPLOYMENT_PATH, 'utf8'));

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

// Contract addresses
const contractAddresses = {
  'RateLimiter': studioDeploymentData.rateLimiter,
  'Bridge': studioDeploymentData.bridge,
  'ERC20HandlerFixed': studioDeploymentData.erc20HandlerFixed,
  'NativeHandler': studioDeploymentData.nativeHandler,
  'StudioPresale': presaleDeploymentData.presale,
  'STORecovery': presaleDeploymentData.recovery
};

// Verify a contract
async function verifyContract(contractName) {
  console.log(`Verifying ${contractName} contract at ${contractAddresses[contractName]}...`);
  
  try {
    // Read the contract source code
    const sourceCode = fs.readFileSync(contractPaths[contractName], 'utf8');
    
    // Encode constructor arguments
    let encodedArgs = '';
    if (constructorArgs[contractName].length > 0) {
      // Create a contract factory to encode the constructor arguments
      const contractFactory = await ethers.getContractFactory(contractName);
      encodedArgs = contractFactory.interface.encodeDeploy(constructorArgs[contractName]);
    }
    
    // Prepare the request data
    const requestData = {
      address: contractAddresses[contractName],
      sourceCode: sourceCode,
      compilerVersion: '0.8.0',
      optimizationUsed: true,
      runs: 200,
      constructorArguments: encodedArgs,
      contractName: contractName,
      evmVersion: 'istanbul'
    };
    
    console.log(`Sending verification request for ${contractName}...`);
    
    // Send the request
    const response = await axios.post(API_URL, requestData);
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response data: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200) {
      console.log(`✅ ${contractName} contract verified successfully!`);
    } else {
      console.log(`❌ Error verifying ${contractName} contract: ${response.statusText}`);
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
