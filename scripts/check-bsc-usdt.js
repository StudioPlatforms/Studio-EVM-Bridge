const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  // Get USDT token address on BSC
  const bscUsdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  console.log(`USDT token address on BSC: ${bscUsdtAddress}`);
  
  // Get USDT token contract on BSC
  const bscUsdt = await ethers.getContractAt("IERC20", bscUsdtAddress);
  
  // Get token name
  try {
    const name = await bscUsdt.name();
    console.log(`Token name: ${name}`);
  } catch (error) {
    console.log(`Error getting token name: ${error.message}`);
  }
  
  // Get token symbol
  try {
    const symbol = await bscUsdt.symbol();
    console.log(`Token symbol: ${symbol}`);
  } catch (error) {
    console.log(`Error getting token symbol: ${error.message}`);
  }
  
  // Get token decimals
  try {
    const decimals = await bscUsdt.decimals();
    console.log(`Token decimals: ${decimals}`);
  } catch (error) {
    console.log(`Error getting token decimals: ${error.message}`);
  }
  
  // Get token total supply
  try {
    const totalSupply = await bscUsdt.totalSupply();
    console.log(`Token total supply: ${ethers.formatUnits(totalSupply, 18)} USDT`);
  } catch (error) {
    console.log(`Error getting token total supply: ${error.message}`);
  }
  
  // Check if the token is a BEP20 token (BSC's version of ERC20)
  console.log(`\nChecking if the token is a BEP20 token...`);
  
  // Get the contract code
  const code = await ethers.provider.getCode(bscUsdtAddress);
  console.log(`Contract code length: ${code.length} bytes`);
  
  // Check if the token has a blacklist function (some tokens have this)
  const blacklistFunctionSignature = ethers.keccak256(ethers.toUtf8Bytes("isBlacklisted(address)")).slice(0, 10);
  console.log(`Blacklist function signature: ${blacklistFunctionSignature}`);
  console.log(`Contract code contains blacklist function: ${code.includes(blacklistFunctionSignature.slice(2))}`);
  
  // Check if the token has a pause function (some tokens have this)
  const pauseFunctionSignature = ethers.keccak256(ethers.toUtf8Bytes("paused()")).slice(0, 10);
  console.log(`Pause function signature: ${pauseFunctionSignature}`);
  console.log(`Contract code contains pause function: ${code.includes(pauseFunctionSignature.slice(2))}`);
  
  // Check if the token has a fee on transfer (some tokens have this)
  console.log(`\nChecking if the token has a fee on transfer...`);
  
  // Get the wallet address
  const [wallet] = await ethers.getSigners();
  console.log(`Wallet address: ${wallet.address}`);
  
  // Get the wallet's USDT balance
  const balance = await bscUsdt.balanceOf(wallet.address);
  console.log(`Wallet USDT balance: ${ethers.formatUnits(balance, 18)} USDT`);
  
  // Check if the token is approved for the ERC20Handler
  const allowance = await bscUsdt.allowance(wallet.address, bscDeploymentData.erc20HandlerFixed);
  console.log(`Current allowance for ERC20Handler: ${ethers.formatUnits(allowance, 18)} USDT`);
  
  // Check if the ERC20Handler is whitelisted for the token
  console.log(`\nChecking if the ERC20Handler is whitelisted for the token...`);
  
  // Get the ERC20Handler contract
  const erc20Handler = await ethers.getContractAt("ERC20HandlerFixed", bscDeploymentData.erc20HandlerFixed);
  
  // Get the USDT resource ID
  const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
  
  // Check if the token is whitelisted
  try {
    const isWhitelisted = await erc20Handler._contractWhitelist(bscUsdtAddress);
    console.log(`Token is whitelisted: ${isWhitelisted}`);
  } catch (error) {
    console.log(`Error checking if token is whitelisted: ${error.message}`);
  }
  
  // Check if the token is mapped to the resource ID
  try {
    const tokenAddress = await erc20Handler._resourceIDToTokenContractAddress(usdtResourceId);
    console.log(`Token address mapped to resource ID: ${tokenAddress}`);
    console.log(`Matches expected token address: ${tokenAddress.toLowerCase() === bscUsdtAddress.toLowerCase()}`);
  } catch (error) {
    console.log(`Error checking if token is mapped to resource ID: ${error.message}`);
  }
  
  console.log(`\nSummary:`);
  console.log(`USDT token on BSC is at address ${bscUsdtAddress}`);
  console.log(`It has ${await bscUsdt.decimals()} decimals`);
  console.log(`The wallet has ${ethers.formatUnits(balance, 18)} USDT`);
  console.log(`The ERC20Handler has an allowance of ${ethers.formatUnits(allowance, 18)} USDT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
