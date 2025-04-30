const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Wallet address to check
  const WALLET_ADDRESS = "0x846C234adc6D8E74353c0c355b0c2B6a1e46634f";
  
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(`Checking balances for wallet: ${WALLET_ADDRESS}`);
  console.log("\nBSC Blockchain:");
  
  // Get BSC provider
  const bscProvider = ethers.provider;
  
  // Check native token balance on BSC
  const bscNativeBalance = await bscProvider.getBalance(WALLET_ADDRESS);
  console.log(`Native token balance: ${ethers.formatEther(bscNativeBalance)} BNB`);
  
  // Get USDT token contract on BSC
  const bscUsdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  const bscUsdt = await ethers.getContractAt("IERC20", bscUsdtAddress);
  
  // Check USDT balance on BSC
  const bscUsdtBalance = await bscUsdt.balanceOf(WALLET_ADDRESS);
  console.log(`USDT balance: ${ethers.formatUnits(bscUsdtBalance, 18)} USDT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });