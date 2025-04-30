const { ethers, network } = require("hardhat");

async function main() {
  const relayerAddress = "0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7";
  
  // Get the provider
  const provider = ethers.provider;
  
  // Load deployment info
  const fs = require("fs");
  const path = require("path");
  
  // Determine which deployment file to use based on the network
  const networkName = network.name;
  
  // Load deployment data
  const deploymentPath = path.resolve(__dirname, `../${networkName}-deployment.json`);
  console.log(`Using deployment file for network: ${networkName}`);
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  
  console.log(`\n=== CHECKING USDC CONFIGURATION ON ${networkName.toUpperCase()} ===\n`);
  
  // Check if USDC resource exists in the deployment data
  if (!deploymentData.resources.usdc) {
    console.error(`USDC resource not found in deployment data. Please add USDC to the bridge first.`);
    process.exit(1);
  }
  
  // Get USDC address and resource ID
  const usdcAddress = deploymentData.resources.usdc.tokenAddress;
  const usdcResourceId = deploymentData.resources.usdc.resourceID;
  
  console.log(`USDC Address: ${usdcAddress}`);
  console.log(`USDC Resource ID: ${usdcResourceId}`);
  
  // Get USDC token contract
  const usdc = await ethers.getContractAt("IERC20", usdcAddress);
  
  // Get token name and symbol
  let tokenName = "Unknown";
  let tokenSymbol = "Unknown";
  let tokenDecimals = 0;
  
  try {
    tokenName = await usdc.name();
    tokenSymbol = await usdc.symbol();
    tokenDecimals = await usdc.decimals();
    
    console.log(`Token Name: ${tokenName}`);
    console.log(`Token Symbol: ${tokenSymbol}`);
    console.log(`Token Decimals: ${tokenDecimals}`);
  } catch (error) {
    console.log(`Error getting token details: ${error.message}`);
  }
  
  // Check USDC balance of the relayer
  const usdcBalance = await usdc.balanceOf(relayerAddress);
  console.log(`Relayer USDC balance: ${ethers.formatUnits(usdcBalance, tokenDecimals)} USDC`);
  
  // Get the correct handler address based on the network
  const handlerAddress = networkName === 'bsc' 
    ? deploymentData.erc20Handler 
    : deploymentData.erc20HandlerFixed;
  
  console.log(`\nHandler Address: ${handlerAddress}`);
  
  // Get the handler contract
  const handler = await ethers.getContractAt("ERC20HandlerFixed", handlerAddress);
  
  // Check if USDC is mapped to the resource ID
  const mappedTokenAddress = await handler._resourceIDToTokenContractAddress(usdcResourceId);
  console.log(`Token address mapped to resource ID: ${mappedTokenAddress}`);
  console.log(`Matches expected USDC address: ${mappedTokenAddress.toLowerCase() === usdcAddress.toLowerCase()}`);
  
  // Check token decimals in the handler
  try {
    const decimals = await handler.getTokenDecimals(usdcResourceId, deploymentData.chainId);
    console.log(`Token decimals for USDC on ${networkName} chain (from handler): ${decimals}`);
  } catch (error) {
    console.log(`Error getting token decimals from handler: ${error.message}`);
  }
  
  // Get the bridge contract
  const bridge = await ethers.getContractAt("Bridge", deploymentData.bridge);
  
  // Check if the resource ID is mapped to the handler in the bridge
  const mappedHandlerAddress = await bridge._resourceIDToHandlerAddress(usdcResourceId);
  console.log(`\nHandler address mapped to resource ID in bridge: ${mappedHandlerAddress}`);
  console.log(`Matches expected handler address: ${mappedHandlerAddress.toLowerCase() === handlerAddress.toLowerCase()}`);
  
  // Check fee percentage
  const feePercentage = await handler._feePercentage();
  console.log(`\nFee percentage: ${feePercentage} (${Number(feePercentage) / 100}%)`);
  
  console.log(`\n=== USDC CONFIGURATION CHECK COMPLETED ===\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
