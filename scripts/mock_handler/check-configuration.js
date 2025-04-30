// This script checks the configuration of the ERC20HandlerFixedV2 contract
const hre = require("hardhat");

async function main() {
  try {
    // Hardcoded contract address
    const contractAddress = "0xb9cccB99E175E683Fa27dF5Cd688F20BBF6b910f";
    
    console.log(`Checking configuration of ERC20HandlerFixedV2 at ${contractAddress}...`);
    
    // Get the contract
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    const contract = ERC20HandlerFixedV2.attach(contractAddress);
    
    // Check chain ID
    try {
      const chainID = await contract.thisChainID();
      console.log(`Chain ID: ${chainID}`);
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
      const USDT_RESOURCE_ID = '0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0';
      const tokenAddress = await contract._resourceIDToTokenContractAddress(USDT_RESOURCE_ID);
      console.log(`Token address for USDT resource ID: ${tokenAddress}`);
      
      // Check if the token is whitelisted
      const isWhitelisted = await contract._contractWhitelist(tokenAddress);
      console.log(`Is token whitelisted: ${isWhitelisted}`);
    } catch (error) {
      console.log(`Failed to get token address: ${error.message}`);
    }
    
  } catch (error) {
    console.error("Error checking configuration:", error);
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
