const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');
const solc = require('solc');
require('dotenv').config();

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

// Function to compile the Bridge contract using solc
async function compileBridgeContract(evmVersion, viaIR) {
  console.log(`Compiling Bridge contract with evmVersion: ${evmVersion}, viaIR: ${viaIR}...`);
  
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
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
        }
      },
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: evmVersion
    }
  };
  
  // Add viaIR if specified
  if (viaIR) {
    input.settings.viaIR = true;
  }
  
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
  const abiCoder = new ethers.AbiCoder();
  return abiCoder.encode(types, values);
}

// Function to get the deployed bytecode
async function getDeployedBytecode() {
  const provider = new ethers.JsonRpcProvider('https://mainnet.studio-blockchain.com');
  const bytecode = await provider.getCode(bridgeAddress);
  return bytecode;
}

// Main function
async function main() {
  try {
    // Get the deployed bytecode
    console.log(`Getting deployed bytecode for Bridge contract at ${bridgeAddress}...`);
    const deployedBytecode = await getDeployedBytecode();
    console.log(`Deployed bytecode length: ${deployedBytecode.length}`);
    console.log(`Deployed bytecode (first 100 chars): ${deployedBytecode.substring(0, 100)}...`);
    console.log(`Deployed bytecode (last 100 chars): ...${deployedBytecode.substring(deployedBytecode.length - 100)}`);
    
    // Try different EVM versions and viaIR settings
    const evmVersions = ['london', 'istanbul', 'berlin', 'petersburg', 'constantinople', 'byzantium'];
    const viaIRSettings = [true, false];
    
    for (const viaIR of viaIRSettings) {
      for (const evmVersion of evmVersions) {
        try {
          // Compile the contract
          const compiledContract = await compileBridgeContract(evmVersion, viaIR);
          
          // Get the bytecode
          const bytecode = '0x' + compiledContract.evm.bytecode.object;
          const runtimeBytecode = '0x' + compiledContract.evm.deployedBytecode.object;
          
          // Encode constructor arguments
          const encodedArgs = encodeConstructorArgs(compiledContract.abi, constructorArgs);
          
          // Full bytecode with constructor arguments
          const fullBytecode = bytecode + encodedArgs.substring(2);
          
          console.log(`\nCompiled with evmVersion: ${evmVersion}, viaIR: ${viaIR}`);
          console.log(`Bytecode length: ${bytecode.length}`);
          console.log(`Runtime bytecode length: ${runtimeBytecode.length}`);
          console.log(`Full bytecode length: ${fullBytecode.length}`);
          
          // Compare bytecodes
          console.log(`\nComparing bytecodes...`);
          
          // Check if the deployed bytecode matches the runtime bytecode
          if (deployedBytecode === runtimeBytecode) {
            console.log(`✅ MATCH! The deployed bytecode matches the runtime bytecode with evmVersion: ${evmVersion}, viaIR: ${viaIR}`);
          } else {
            console.log(`❌ The deployed bytecode does NOT match the runtime bytecode with evmVersion: ${evmVersion}, viaIR: ${viaIR}`);
            
            // Calculate similarity percentage
            let matchingChars = 0;
            const minLength = Math.min(deployedBytecode.length, runtimeBytecode.length);
            
            for (let i = 0; i < minLength; i++) {
              if (deployedBytecode[i] === runtimeBytecode[i]) {
                matchingChars++;
              }
            }
            
            const similarityPercentage = (matchingChars / minLength) * 100;
            console.log(`Similarity percentage: ${similarityPercentage.toFixed(2)}%`);
          }
        } catch (error) {
          console.error(`Error compiling with evmVersion: ${evmVersion}, viaIR: ${viaIR}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
