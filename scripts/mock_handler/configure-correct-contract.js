// This script configures the correct ERC20HandlerFixedV2 contract
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Configuration
const CONTRACT_ADDRESS = "0x758fB5cbEC0A8b0C47800Fe0792F569D3665783b";
const STUDIO_CHAIN_ID = 240241;
const RATE_LIMITER_ADDRESS = "0xEf66f88082c592F30357AB648CA0d4e26b009A46";
const USDT_ADDRESS = "0xFcCC20bf4f0829e121bC99FF2222456Ad4465A1E";
const USDT_RESOURCE_ID = "0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0";

async function main() {
  try {
    console.log(`Configuring ERC20HandlerFixedV2 at ${CONTRACT_ADDRESS}...`);
    
    // Get the network
    const network = await hre.ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Using account: ${deployer.address}`);
    console.log(`Account balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);
    
    // Get the contract
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    const contract = ERC20HandlerFixedV2.attach(CONTRACT_ADDRESS);
    
    // Check current configuration
    console.log("\n--- CURRENT CONFIGURATION ---");
    
    try {
      const bridgeAddress = await contract._bridgeAddress();
      console.log(`Bridge address: ${bridgeAddress}`);
    } catch (error) {
      console.log(`Failed to get bridge address: ${error.message}`);
    }
    
    try {
      const feePercentage = await contract._feePercentage();
      console.log(`Fee percentage: ${feePercentage}`);
    } catch (error) {
      console.log(`Failed to get fee percentage: ${error.message}`);
    }
    
    try {
      const chainID = await contract.thisChainID();
      console.log(`Chain ID: ${chainID}`);
    } catch (error) {
      console.log(`Could not get chain ID: ${error.message}`);
    }
    
    try {
      const rateLimiter = await contract.rateLimiter();
      console.log(`Rate limiter: ${rateLimiter}`);
    } catch (error) {
      console.log(`Failed to get rate limiter: ${error.message}`);
    }
    
    try {
      const tokenAddress = await contract._resourceIDToTokenContractAddress(USDT_RESOURCE_ID);
      console.log(`Token address for USDT resource ID: ${tokenAddress}`);
      
      const isWhitelisted = await contract._contractWhitelist(tokenAddress);
      console.log(`Is token whitelisted: ${isWhitelisted}`);
    } catch (error) {
      console.log(`Failed to get token address: ${error.message}`);
    }
    
    // Configure the contract
    console.log("\n--- CONFIGURING CONTRACT ---");
    
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
    
    // Update deployment file
    console.log('\n--- UPDATING DEPLOYMENT FILE ---');
    
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
      bridgeAddress: await contract._bridgeAddress(),
      erc20HandlerFixedV2: CONTRACT_ADDRESS,
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
    
    console.log(`Deployment file updated at: ${deploymentFilePath}`);
    
    // Verify configuration
    console.log("\n--- VERIFYING CONFIGURATION ---");
    
    try {
      const chainID = await contract.thisChainID();
      console.log(`Chain ID: ${chainID}`);
    } catch (error) {
      console.log(`Could not get chain ID: ${error.message}`);
    }
    
    try {
      const rateLimiter = await contract.rateLimiter();
      console.log(`Rate limiter: ${rateLimiter}`);
    } catch (error) {
      console.log(`Failed to get rate limiter: ${error.message}`);
    }
    
    try {
      const tokenAddress = await contract._resourceIDToTokenContractAddress(USDT_RESOURCE_ID);
      console.log(`Token address for USDT resource ID: ${tokenAddress}`);
      
      const isWhitelisted = await contract._contractWhitelist(tokenAddress);
      console.log(`Is token whitelisted: ${isWhitelisted}`);
    } catch (error) {
      console.log(`Failed to get token address: ${error.message}`);
    }
    
    console.log("\n--- CONFIGURATION COMPLETED SUCCESSFULLY ---");
    console.log(`Contract address: ${CONTRACT_ADDRESS}`);
    console.log(`Bridge address: ${await contract._bridgeAddress()}`);
    console.log(`Fee percentage: ${await contract._feePercentage()}`);
    console.log(`Chain ID: ${await contract.thisChainID()}`);
    console.log(`Rate limiter: ${await contract.rateLimiter()}`);
    console.log(`USDT resource ID: ${USDT_RESOURCE_ID}`);
    console.log(`USDT address: ${await contract._resourceIDToTokenContractAddress(USDT_RESOURCE_ID)}`);
    
  } catch (error) {
    console.error("Error configuring contract:", error);
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
