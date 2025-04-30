// This script verifies the ERC20HandlerFixedV2 contract using a flattened source file
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

async function main() {
  // Hardcoded contract address and constructor arguments
  const contractAddress = "0x758fB5cbEC0A8b0C47800Fe0792F569D3665783b";
  const bridgeAddress = "0x7FD526dC3d193a3dA6C330956813A6B358BCA1Ff";
  const feePercentage = 100;
  
  console.log(`Verifying ERC20HandlerFixedV2 at ${contractAddress}...`);
  console.log(`Bridge address: ${bridgeAddress}`);
  console.log(`Fee percentage: ${feePercentage}`);
  
  // Flatten the contract
  console.log("Flattening contract...");
  const contractPath = "contracts/mock_handler/ERC20HandlerFixedV2.sol";
  const flattenedPath = "flattened/ERC20HandlerFixedV2-for-verification.sol";
  
  // Create the flattened directory if it doesn't exist
  const flattenedDir = path.dirname(flattenedPath);
  if (!fs.existsSync(flattenedDir)) {
    fs.mkdirSync(flattenedDir, { recursive: true });
  }
  
  try {
    // Flatten the contract
    execSync(`npx hardhat flatten ${contractPath} > ${flattenedPath}`, { encoding: 'utf8' });
    console.log(`Successfully flattened contract to ${flattenedPath}`);
    
    // Read the flattened source code
    const flattenedSourceCode = fs.readFileSync(flattenedPath, 'utf8');
    
    // Try to verify using Hardhat's built-in verification
    try {
      console.log("Attempting to verify contract using Hardhat...");
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [bridgeAddress, feePercentage]
      });
      console.log("Contract verified successfully using Hardhat!");
    } catch (error) {
      console.log(`Hardhat verification failed: ${error.message}`);
      
      // Try manual verification
      try {
        // Install axios if not already installed
        try {
          require.resolve('axios');
        } catch (error) {
          console.log('Installing axios...');
          execSync('npm install axios');
        }
        
        // Get the contract factory
        const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
        
        // Encode constructor arguments
        const encodedArgs = ERC20HandlerFixedV2.interface.encodeDeploy([bridgeAddress, feePercentage]);
        
        // Prepare the request data
        const requestData = {
          address: contractAddress,
          sourceCode: flattenedSourceCode,
          compilerVersion: '0.8.0',
          contractName: 'ERC20HandlerFixedV2',
          optimizationUsed: true,
          runs: 200,
          constructorArguments: encodedArgs,
          evmVersion: 'istanbul'
        };
        
        // Send the verification request
        console.log("Sending manual verification request...");
        const response = await axios.post('https://mainnetindexer.studio-blockchain.com/contracts/verify', requestData, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.data.success) {
          console.log("Contract verified successfully using manual verification!");
        } else {
          console.log(`Manual verification failed: ${response.data.error}`);
        }
      } catch (error) {
        console.log(`Manual verification failed: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`Error flattening contract: ${error.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
