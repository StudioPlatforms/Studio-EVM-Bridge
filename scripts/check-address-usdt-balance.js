const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Wallet address to check
const WALLET_ADDRESS = "0xa71127F0bb598c4B9FC30E67735b64d027C794db";

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  console.log(`Checking USDT balance for address: ${WALLET_ADDRESS}`);
  
  // Get Studio provider
  const studioProvider = ethers.provider;
  
  // Get USDT token contract on Studio
  const studioUsdtAddress = studioDeploymentData.resources.usdt.tokenAddress;
  const studioUsdt = await ethers.getContractAt("IERC20", studioUsdtAddress);
  
  // Check USDT balance on Studio
  const studioUsdtBalance = await studioUsdt.balanceOf(WALLET_ADDRESS);
  console.log(`USDT balance on Studio: ${ethers.formatUnits(studioUsdtBalance, 6)} USDT`);
  
  // Check native token balance on Studio
  const studioNativeBalance = await studioProvider.getBalance(WALLET_ADDRESS);
  console.log(`Native token balance on Studio: ${ethers.formatEther(studioNativeBalance)} STO`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
