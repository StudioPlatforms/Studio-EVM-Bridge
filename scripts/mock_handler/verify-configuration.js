// This script verifies the configuration of the ERC20HandlerFixedV2 contract
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Configuration
const STUDIO_CHAIN_ID = 240241;
const RATE_LIMITER_ADDRESS = "0xEf66f88082c592F30357AB648CA0d4e26b009A46";
const USDT_ADDRESS = "0xFcCC20bf4f0829e121bC99FF2222456Ad4465A1E";
const USDT_RESOURCE_ID = "0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0";

async function main() {
  try {
    // Read deployment file to get contract address
    const deploymentFilePath = path.resolve(__dirname, '../../mock_handler/erc20-handler-fixed-v2-deployment.json');
    let deploymentData = {};
    
    if (fs.existsSync(deploymentFilePath)) {
      try {
        deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
      } catch (error) {
        console.log(`Could not read deployment file: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log(`Deployment file not found at ${deploymentFilePath}`);
      process.exit(1);
    }
    
    // Use the address that the configuration transactions were sent to
    const contractAddress = "0x14C0153a10bBfF9e71C059FDF193047ebcA9cf9E";
    console.log(`Verifying configuration of ERC20HandlerFixedV2 at ${contractAddress}...`);
    
    // Get the contract
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    const contract = ERC20HandlerFixedV2.attach(contractAddress);
    
    // Check chain ID
    try {
      // Try different function names for chain ID
      try {
        const chainID = await contract.thisChainID();
        console.log(`Chain ID: ${chainID}`);
      } catch (error) {
        console.log(`Could not call thisChainID(): ${error.message}`);
        try {
          const chainID = await contract._thisChainID();
          console.log(`Chain ID: ${chainID}`);
        } catch (error) {
          console.log(`Could not call _thisChainID(): ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`Failed to get chain ID: ${error.message}`);
    }
    
    // Check rate limiter
    try {
      const rateLimiter = await contract.rateLimiter();
      console.log(`Rate limiter: ${rateLimiter}`);
    } catch (error) {
      console.log(`Failed to get rate limiter: ${error.message}`);
    }
    
    // Check resource ID to token contract address mapping
    try {
      const tokenAddress = await contract._resourceIDToTokenContractAddress(USDT_RESOURCE_ID);
      console.log(`Token address for USDT resource ID: ${tokenAddress}`);
      
      // Check if the token is whitelisted
      const isWhitelisted = await contract._contractWhitelist(tokenAddress);
      console.log(`Is token whitelisted: ${isWhitelisted}`);
    } catch (error) {
      console.log(`Failed to get token address: ${error.message}`);
    }
    
    // Check bridge address
    try {
      const bridgeAddress = await contract._bridgeAddress();
      console.log(`Bridge address: ${bridgeAddress}`);
    } catch (error) {
      console.log(`Failed to get bridge address: ${error.message}`);
    }
    
    // Check fee percentage
    try {
      const feePercentage = await contract._feePercentage();
      console.log(`Fee percentage: ${feePercentage}`);
    } catch (error) {
      console.log(`Failed to get fee percentage: ${error.message}`);
    }
    
    console.log("\nConfiguration verification completed!");
    
  } catch (error) {
    console.error("Error verifying configuration:", error);
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
