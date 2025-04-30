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
  
  console.log(`\n=== CHECKING 3DC CONFIGURATION ON ${networkName.toUpperCase()} ===\n`);
  
  // Check if 3DC resource exists in the deployment data
  if (!deploymentData.resources.dc3) {
    console.error(`3DC resource not found in deployment data. Please add 3DC to the bridge first.`);
    process.exit(1);
  }
  
  // Get 3DC address and resource ID
  const dc3Address = deploymentData.resources.dc3.tokenAddress;
  const dc3ResourceId = deploymentData.resources.dc3.resourceID;
  
  console.log(`3DC Address: ${dc3Address}`);
  console.log(`3DC Resource ID: ${dc3ResourceId}`);
  
  // Get 3DC token contract
  const dc3 = await ethers.getContractAt("IERC20", dc3Address);
  
  // Get token name and symbol
  let tokenName = "Unknown";
  let tokenSymbol = "Unknown";
  let tokenDecimals = 0;
  
  try {
    tokenName = await dc3.name();
    tokenSymbol = await dc3.symbol();
    tokenDecimals = await dc3.decimals();
    
    console.log(`Token Name: ${tokenName}`);
    console.log(`Token Symbol: ${tokenSymbol}`);
    console.log(`Token Decimals: ${tokenDecimals}`);
  } catch (error) {
    console.log(`Error getting token details: ${error.message}`);
  }
  
  // Check 3DC balance of the relayer
  const dc3Balance = await dc3.balanceOf(relayerAddress);
  console.log(`Relayer 3DC balance: ${ethers.formatUnits(dc3Balance, tokenDecimals)} 3DC`);
  
  // Get the correct handler address based on the network
  const handlerAddress = networkName === 'bsc' 
    ? deploymentData.erc20Handler 
    : deploymentData.erc20HandlerFixed;
  
  console.log(`\nHandler Address: ${handlerAddress}`);
  
  // Get the handler contract
  const handler = await ethers.getContractAt("ERC20HandlerFixed", handlerAddress);
  
  // Check if 3DC is mapped to the resource ID
  const mappedTokenAddress = await handler._resourceIDToTokenContractAddress(dc3ResourceId);
  console.log(`Token address mapped to resource ID: ${mappedTokenAddress}`);
  console.log(`Matches expected 3DC address: ${mappedTokenAddress.toLowerCase() === dc3Address.toLowerCase()}`);
  
  // Check token decimals in the handler
  try {
    const decimals = await handler.getTokenDecimals(dc3ResourceId, deploymentData.chainId);
    console.log(`Token decimals for 3DC on ${networkName} chain (from handler): ${decimals}`);
  } catch (error) {
    console.log(`Error getting token decimals from handler: ${error.message}`);
  }
  
  // Get the bridge contract
  const bridge = await ethers.getContractAt("Bridge", deploymentData.bridge);
  
  // Check if the resource ID is mapped to the handler in the bridge
  const mappedHandlerAddress = await bridge._resourceIDToHandlerAddress(dc3ResourceId);
  console.log(`\nHandler address mapped to resource ID in bridge: ${mappedHandlerAddress}`);
  console.log(`Matches expected handler address: ${mappedHandlerAddress.toLowerCase() === handlerAddress.toLowerCase()}`);
  
  // Check fee percentage
  const feePercentage = await handler._feePercentage();
  console.log(`\nFee percentage: ${feePercentage} (${Number(feePercentage) / 100}%)`);
  
  console.log(`\n=== 3DC CONFIGURATION CHECK COMPLETED ===\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
