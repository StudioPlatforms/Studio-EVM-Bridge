const { ethers, network } = require("hardhat");

async function main() {
  const relayerAddress = "0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7";
  
  // Get the provider
  const provider = ethers.provider;
  
  // Load deployment info to get USDT address
  const fs = require("fs");
  const path = require("path");
  
  // Determine which deployment file to use based on the network
  const networkName = network.name;
  
  // Check native token balance
  const balance = await provider.getBalance(relayerAddress);
  const nativeSymbol = networkName === 'studio' ? 'STO' : networkName === 'bsc' ? 'BNB' : 'ETH';
  console.log(`Relayer (${relayerAddress}) native token balance: ${ethers.formatEther(balance)} ${nativeSymbol}`);
  
  // Load deployment data
  const deploymentPath = path.resolve(__dirname, `../${networkName}-deployment.json`);
  console.log(`Using deployment file for network: ${networkName}`);
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  
  // Check USDT balance
  const usdtAddress = deploymentData.resources.usdt.tokenAddress;
  const usdt = await ethers.getContractAt("IERC20", usdtAddress);
  
  // Get token decimals
  let tokenDecimals = 6; // Default for Studio
  try {
    tokenDecimals = await usdt.decimals();
    console.log(`USDT token decimals: ${tokenDecimals}`);
  } catch (error) {
    console.log(`Error getting token decimals directly, using default: ${tokenDecimals}`);
  }
  
  const usdtBalance = await usdt.balanceOf(relayerAddress);
  console.log(`Relayer USDT balance: ${ethers.formatUnits(usdtBalance, tokenDecimals)} USDT`);
  
  // Check if the relayer is registered in the bridge
  const bridge = await ethers.getContractAt("Bridge", deploymentData.bridge);
  const isRelayer = await bridge.isRelayer(relayerAddress);
  console.log(`Is relayer registered in bridge: ${isRelayer}`);
  
  // Check ERC20HandlerFixed contract
  const erc20Handler = await ethers.getContractAt("ERC20HandlerFixed", deploymentData.erc20HandlerFixed);
  
  // Check if USDT is whitelisted
  const usdtResourceId = deploymentData.resources.usdt.resourceID;
  const tokenAddress = await erc20Handler._resourceIDToTokenContractAddress(usdtResourceId);
  console.log(`Token address for resource ID ${usdtResourceId}: ${tokenAddress}`);
  console.log(`Expected USDT address: ${usdtAddress}`);
  console.log(`Match: ${tokenAddress.toLowerCase() === usdtAddress.toLowerCase()}`);
  
  // Check token decimals
  try {
    const decimals = await erc20Handler.getTokenDecimals(usdtResourceId, deploymentData.chainId);
    console.log(`Token decimals for USDT on ${networkName} chain: ${decimals}`);
  } catch (error) {
    console.log(`Error getting token decimals: ${error.message}`);
  }
  
  // Check fee percentage
  const feePercentage = await erc20Handler._feePercentage();
  console.log(`Fee percentage: ${feePercentage} (${Number(feePercentage) / 100}%)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
