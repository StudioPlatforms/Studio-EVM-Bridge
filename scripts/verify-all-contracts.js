const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');

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

// Function to verify a contract
async function verifyContract(contractName) {
  try {
    const address = contractAddresses[contractName];
    console.log(`Verifying ${contractName} contract at ${address}...`);
    
    // Read the contract source code and all imported files
    const mainSourceCode = fs.readFileSync(contractPaths[contractName], 'utf8');
    
    // Create a JSON object with all source files
    const sources = {};
    
    // Handle presale contracts differently
    if (contractName === 'StudioPresale' || contractName === 'STORecovery') {
      sources['presale/' + contractName + '.sol'] = { content: mainSourceCode };
    } else {
      sources[contractName + '.sol'] = { content: mainSourceCode };
    }
    
    // Add imported files based on the contract
    if (contractName === 'RateLimiter') {
      sources['interfaces/IRateLimiter.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IRateLimiter.sol'), 'utf8') 
      };
    } else if (contractName === 'Bridge') {
      sources['security/ReentrancyGuard.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/security/ReentrancyGuard.sol'), 'utf8') 
      };
      sources['security/Pausable.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/security/Pausable.sol'), 'utf8') 
      };
      sources['security/Ownable.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/security/Ownable.sol'), 'utf8') 
      };
      sources['interfaces/IBridge.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IBridge.sol'), 'utf8') 
      };
      sources['interfaces/IHandler.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IHandler.sol'), 'utf8') 
      };
      sources['interfaces/IERC20.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IERC20.sol'), 'utf8') 
      };
    } else if (contractName === 'ERC20HandlerFixed') {
      sources['interfaces/IHandler.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IHandler.sol'), 'utf8') 
      };
      sources['interfaces/IRateLimiter.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IRateLimiter.sol'), 'utf8') 
      };
      sources['interfaces/IERC20.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IERC20.sol'), 'utf8') 
      };
      sources['HandlerHelpers.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/HandlerHelpers.sol'), 'utf8') 
      };
    } else if (contractName === 'NativeHandler') {
      sources['interfaces/IHandler.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IHandler.sol'), 'utf8') 
      };
      sources['interfaces/IRateLimiter.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IRateLimiter.sol'), 'utf8') 
      };
      sources['HandlerHelpers.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/HandlerHelpers.sol'), 'utf8') 
      };
    } else if (contractName === 'StudioPresale') {
      sources['security/ReentrancyGuard.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/security/ReentrancyGuard.sol'), 'utf8') 
      };
      sources['security/Pausable.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/security/Pausable.sol'), 'utf8') 
      };
      sources['security/Ownable.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/security/Ownable.sol'), 'utf8') 
      };
      sources['interfaces/IERC20.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/interfaces/IERC20.sol'), 'utf8') 
      };
      sources['ERC20SafeFixed.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/ERC20SafeFixed.sol'), 'utf8') 
      };
    } else if (contractName === 'STORecovery') {
      sources['security/Ownable.sol'] = { 
        content: fs.readFileSync(path.resolve(__dirname, '../contracts/security/Ownable.sol'), 'utf8') 
      };
    }
    
    // For multi-file verification, we need to use the standard input JSON format
    const input = {
      language: 'Solidity',
      sources: sources,
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: 'istanbul',
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode.object']
          }
        }
      }
    };
    
    // Convert input object to JSON string
    const sourceCode = JSON.stringify(input);
    
    // Encode constructor arguments
    let encodedArgs = '';
    if (constructorArgs[contractName].length > 0) {
      // Create a contract factory to encode the constructor arguments
      const contractFactory = await ethers.getContractFactory(contractName);
      encodedArgs = contractFactory.interface.encodeDeploy(constructorArgs[contractName]);
    }
    
    // Check if contract is already verified
    const isVerified = await isContractVerified(address);
    if (isVerified) {
      console.log(`${contractName} contract at ${address} is already verified.`);
      return;
    }
    
    // Use the correct EVM version for Solidity 0.8.0
    const requestData = {
      address: address,
      sourceCode: sourceCode,
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
