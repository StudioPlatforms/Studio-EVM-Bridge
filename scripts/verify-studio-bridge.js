const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('hardhat');

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  console.log("Verifying Studio bridge contracts...");
  
  // Contract addresses
  const rateLimiterAddress = studioDeploymentData.rateLimiter;
  const bridgeAddress = studioDeploymentData.bridge;
  const erc20HandlerFixedAddress = studioDeploymentData.erc20HandlerFixed;
  const nativeHandlerAddress = studioDeploymentData.nativeHandler;
  
  // Constructor arguments
  const bridgeArgs = [
    240241, // Chain ID
    ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"], // Initial relayers
    1 // Relayer threshold
  ];
  
  const erc20HandlerFixedArgs = [
    bridgeAddress, // Bridge address
    100 // Fee percentage (1%)
  ];
  
  const nativeHandlerArgs = [
    bridgeAddress, // Bridge address
    100 // Fee percentage (1%)
  ];
  
  try {
    // Verify RateLimiter contract
    console.log(`\nVerifying RateLimiter contract at ${rateLimiterAddress}...`);
    
    // Print the command to verify the contract
    console.log("\nTo verify the RateLimiter contract, use the following command in the Studio blockchain explorer:");
    console.log(`Contract Address: ${rateLimiterAddress}`);
    console.log(`Contract Name: RateLimiter`);
    console.log(`Compiler Version: v0.8.0`);
    console.log(`Optimization: Enabled with 200 runs`);
    console.log(`EVM Version: istanbul`);
    console.log(`Constructor Arguments: 0x`);
    
    // Verify Bridge contract
    console.log(`\nVerifying Bridge contract at ${bridgeAddress}...`);
    console.log("Constructor arguments:", bridgeArgs);
    
    // Create a contract factory to encode the constructor arguments
    const Bridge = await ethers.getContractFactory("Bridge");
    const encodedBridgeArgs = Bridge.interface.encodeDeploy(bridgeArgs);
    
    console.log("Encoded constructor arguments:", encodedBridgeArgs);
    
    // Print the command to verify the contract
    console.log("\nTo verify the Bridge contract, use the following command in the Studio blockchain explorer:");
    console.log(`Contract Address: ${bridgeAddress}`);
    console.log(`Contract Name: Bridge`);
    console.log(`Compiler Version: v0.8.0`);
    console.log(`Optimization: Enabled with 200 runs`);
    console.log(`EVM Version: istanbul`);
    console.log(`Constructor Arguments: ${encodedBridgeArgs}`);
    
    // Verify ERC20HandlerFixed contract
    console.log(`\nVerifying ERC20HandlerFixed contract at ${erc20HandlerFixedAddress}...`);
    console.log("Constructor arguments:", erc20HandlerFixedArgs);
    
    // Create a contract factory to encode the constructor arguments
    const ERC20HandlerFixed = await ethers.getContractFactory("ERC20HandlerFixed");
    const encodedERC20HandlerFixedArgs = ERC20HandlerFixed.interface.encodeDeploy(erc20HandlerFixedArgs);
    
    console.log("Encoded constructor arguments:", encodedERC20HandlerFixedArgs);
    
    // Print the command to verify the contract
    console.log("\nTo verify the ERC20HandlerFixed contract, use the following command in the Studio blockchain explorer:");
    console.log(`Contract Address: ${erc20HandlerFixedAddress}`);
    console.log(`Contract Name: ERC20HandlerFixed`);
    console.log(`Compiler Version: v0.8.0`);
    console.log(`Optimization: Enabled with 200 runs`);
    console.log(`EVM Version: istanbul`);
    console.log(`Constructor Arguments: ${encodedERC20HandlerFixedArgs}`);
    
    // Verify NativeHandler contract
    console.log(`\nVerifying NativeHandler contract at ${nativeHandlerAddress}...`);
    console.log("Constructor arguments:", nativeHandlerArgs);
    
    // Create a contract factory to encode the constructor arguments
    const NativeHandler = await ethers.getContractFactory("NativeHandler");
    const encodedNativeHandlerArgs = NativeHandler.interface.encodeDeploy(nativeHandlerArgs);
    
    console.log("Encoded constructor arguments:", encodedNativeHandlerArgs);
    
    // Print the command to verify the contract
    console.log("\nTo verify the NativeHandler contract, use the following command in the Studio blockchain explorer:");
    console.log(`Contract Address: ${nativeHandlerAddress}`);
    console.log(`Contract Name: NativeHandler`);
    console.log(`Compiler Version: v0.8.0`);
    console.log(`Optimization: Enabled with 200 runs`);
    console.log(`EVM Version: istanbul`);
    console.log(`Constructor Arguments: ${encodedNativeHandlerArgs}`);
    
    console.log("\nVerification process completed!");
  } catch (error) {
    console.error("Error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
