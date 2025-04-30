// This script deploys, configures, and verifies the ERC20HandlerFixedV2 contract in one go
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

// Configuration
const BRIDGE_ADDRESS = "0x7FD526dC3d193a3dA6C330956813A6B358BCA1Ff";
const FEE_PERCENTAGE = 100; // 1%
const STUDIO_CHAIN_ID = 240241;
const RATE_LIMITER_ADDRESS = "0xEf66f88082c592F30357AB648CA0d4e26b009A46";
const USDT_ADDRESS = "0xFcCC20bf4f0829e121bC99FF2222456Ad4465A1E";
const USDT_RESOURCE_ID = "0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0";

async function main() {
  try {
    console.log("Starting deployment, configuration, and verification process...");
    
    // Get the network
    const network = await hre.ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Using account: ${deployer.address}`);
    console.log(`Account balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);
    
    // Step 1: Deploy the contract
    console.log("\n--- STEP 1: DEPLOYING CONTRACT ---");
    
    // Get the contract factory
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    
    // Deploy the contract
    console.log(`Deploying ERC20HandlerFixedV2 with bridge address ${BRIDGE_ADDRESS} and fee percentage ${FEE_PERCENTAGE}...`);
    const deployTx = await ERC20HandlerFixedV2.deploy(BRIDGE_ADDRESS, FEE_PERCENTAGE);
    
    // Get the transaction hash
    const txHash = deployTx.deploymentTransaction().hash;
    console.log(`Deployment transaction hash: ${txHash}`);
    
    // Wait for the transaction to be mined
    console.log("Waiting for deployment transaction to be mined...");
    await deployTx.waitForDeployment();
    const contractAddress = await deployTx.getAddress();
    console.log(`Contract deployed at: ${contractAddress}`);
    
    // Update deployment file
    const deploymentDir = path.resolve(__dirname, '../../mock_handler');
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentFilePath = path.resolve(deploymentDir, 'erc20-handler-fixed-v2-deployment.json');
    let deploymentData = {};
    
    if (fs.existsSync(deploymentFilePath)) {
      try {
        deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
      } catch (error) {
        console.log(`Could not read existing deployment file: ${error.message}`);
      }
    }
    
    deploymentData = {
      ...deploymentData,
      network: 'studio',
      chainId: STUDIO_CHAIN_ID,
      bridgeAddress: BRIDGE_ADDRESS,
      erc20HandlerFixedV2: contractAddress,
      deploymentTransaction: txHash,
      deployedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(
      deploymentFilePath,
      JSON.stringify(deploymentData, null, 2)
    );
    
    console.log(`Deployment file updated at: ${deploymentFilePath}`);
    
    // Step 2: Configure the contract
    console.log("\n--- STEP 2: CONFIGURING CONTRACT ---");
    
    // Get the deployed contract
    const contract = ERC20HandlerFixedV2.attach(contractAddress);
    
    // Set this chain ID
    console.log(`Setting chain ID to ${STUDIO_CHAIN_ID}...`);
    const setChainIDTx = await contract.setThisChainID(STUDIO_CHAIN_ID);
    console.log(`Transaction hash: ${setChainIDTx.hash}`);
    await setChainIDTx.wait();
    console.log("Chain ID set successfully!");
    
    // Set rate limiter
    console.log(`Setting rate limiter to ${RATE_LIMITER_ADDRESS}...`);
    const setRateLimiterTx = await contract.updateRateLimiter(RATE_LIMITER_ADDRESS);
    console.log(`Transaction hash: ${setRateLimiterTx.hash}`);
    await setRateLimiterTx.wait();
    console.log("Rate limiter set successfully!");
    
    // Set resource for USDT
    console.log(`Setting resource for USDT (${USDT_RESOURCE_ID} -> ${USDT_ADDRESS})...`);
    const setResourceTx = await contract.setResourceIDToTokenContractAddress(USDT_RESOURCE_ID, USDT_ADDRESS);
    console.log(`Transaction hash: ${setResourceTx.hash}`);
    await setResourceTx.wait();
    console.log("USDT resource set successfully!");
    
    // Auto-detect decimals for USDT
    console.log('Auto-detecting decimals for USDT...');
    const autoDetectDecimalsTx = await contract.autoDetectDecimals(USDT_RESOURCE_ID);
    console.log(`Transaction hash: ${autoDetectDecimalsTx.hash}`);
    await autoDetectDecimalsTx.wait();
    console.log("USDT decimals auto-detected successfully!");
    
    // Update deployment file with configuration data
    deploymentData = {
      ...deploymentData,
      rateLimiter: RATE_LIMITER_ADDRESS,
      resources: {
        usdt: {
          resourceID: USDT_RESOURCE_ID,
          tokenAddress: USDT_ADDRESS
        }
      },
      configurationTransactions: {
        setChainID: setChainIDTx.hash,
        setRateLimiter: setRateLimiterTx.hash,
        setResource: setResourceTx.hash,
        autoDetectDecimals: autoDetectDecimalsTx.hash
      },
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(
      deploymentFilePath,
      JSON.stringify(deploymentData, null, 2)
    );
    
    console.log(`Deployment file updated with configuration data at: ${deploymentFilePath}`);
    
    // Step 3: Verify the contract
    console.log("\n--- STEP 3: VERIFYING CONTRACT ---");
    
    // Flatten the contract
    console.log("Flattening contract...");
    const contractPath = "contracts/mock_handler/ERC20HandlerFixedV2.sol";
    const flattenedPath = "flattened/ERC20HandlerFixedV2-for-verification.sol";
    
    // Create the flattened directory if it doesn't exist
    const flattenedDir = path.dirname(flattenedPath);
    if (!fs.existsSync(flattenedDir)) {
      fs.mkdirSync(flattenedDir, { recursive: true });
    }
    
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
        constructorArguments: [BRIDGE_ADDRESS, FEE_PERCENTAGE]
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
        
        // Encode constructor arguments
        const encodedArgs = ERC20HandlerFixedV2.interface.encodeDeploy([BRIDGE_ADDRESS, FEE_PERCENTAGE]);
        
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
    
    // Verify configuration
    console.log("\n--- VERIFYING CONFIGURATION ---");
    
    const chainID = await contract.thisChainID();
    console.log(`Chain ID: ${chainID}`);
    
    const rateLimiter = await contract.rateLimiter();
    console.log(`Rate limiter: ${rateLimiter}`);
    
    const tokenAddress = await contract._resourceIDToTokenContractAddress(USDT_RESOURCE_ID);
    console.log(`Token address for USDT resource ID: ${tokenAddress}`);
    
    const isWhitelisted = await contract._contractWhitelist(tokenAddress);
    console.log(`Is token whitelisted: ${isWhitelisted}`);
    
    console.log("\n--- PROCESS COMPLETED SUCCESSFULLY ---");
    console.log(`Contract address: ${contractAddress}`);
    console.log(`Bridge address: ${await contract._bridgeAddress()}`);
    console.log(`Fee percentage: ${await contract._feePercentage()}`);
    console.log(`Chain ID: ${await contract.thisChainID()}`);
    console.log(`Rate limiter: ${await contract.rateLimiter()}`);
    console.log(`USDT resource ID: ${USDT_RESOURCE_ID}`);
    console.log(`USDT address: ${await contract._resourceIDToTokenContractAddress(USDT_RESOURCE_ID)}`);
    
  } catch (error) {
    console.error("Error in deployment, configuration, or verification process:");
    console.error(error);
    
    // Log more details about the error
    if (error.transaction) {
      console.error("Transaction details:");
      console.error(error.transaction);
    }
    
    if (error.receipt) {
      console.error("Transaction receipt:");
      console.error(error.receipt);
    }
    
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
