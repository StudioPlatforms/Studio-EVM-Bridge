const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Wallet address to check
const WALLET_ADDRESS = "0x846C234adc6D8E74353c0c355b0c2B6a1e46634f";

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(`Checking balances for wallet: ${WALLET_ADDRESS}`);
  
  // Check Studio balance
  console.log("\nStudio Blockchain:");
  
  // Get Studio provider
  const studioProvider = ethers.provider;
  
  // Check native token balance on Studio
  const studioNativeBalance = await studioProvider.getBalance(WALLET_ADDRESS);
  console.log(`Native token balance: ${ethers.formatEther(studioNativeBalance)} STO`);
  
  // Get USDT token contract on Studio
  const studioUsdtAddress = studioDeploymentData.resources.usdt.tokenAddress;
  const studioUsdt = await ethers.getContractAt("IERC20", studioUsdtAddress);
  
  // Check USDT balance on Studio
  const studioUsdtBalance = await studioUsdt.balanceOf(WALLET_ADDRESS);
  console.log(`USDT balance: ${ethers.formatUnits(studioUsdtBalance, 6)} USDT`);
  
  // Check BSC balance
  console.log("\nBSC Blockchain:");
  console.log("To check BSC balance, run the following command:");
  console.log("npx hardhat run scripts/check-bsc-balance.js --network bsc");
  
  // Create the BSC balance check script
  const bscBalanceScript = `const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Wallet address to check
  const WALLET_ADDRESS = "${WALLET_ADDRESS}";
  
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(\`Checking balances for wallet: \${WALLET_ADDRESS}\`);
  console.log("\\nBSC Blockchain:");
  
  // Get BSC provider
  const bscProvider = ethers.provider;
  
  // Check native token balance on BSC
  const bscNativeBalance = await bscProvider.getBalance(WALLET_ADDRESS);
  console.log(\`Native token balance: \${ethers.formatEther(bscNativeBalance)} BNB\`);
  
  // Get USDT token contract on BSC
  const bscUsdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  const bscUsdt = await ethers.getContractAt("IERC20", bscUsdtAddress);
  
  // Check USDT balance on BSC
  const bscUsdtBalance = await bscUsdt.balanceOf(WALLET_ADDRESS);
  console.log(\`USDT balance: \${ethers.formatUnits(bscUsdtBalance, 18)} USDT\`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });`;
  
  // Write the BSC balance check script to a file
  fs.writeFileSync(path.resolve(__dirname, './check-bsc-balance.js'), bscBalanceScript);
  console.log("\nCreated check-bsc-balance.js script");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
