const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  // Get USDT resource ID
  const usdtResourceId = studioDeploymentData.resources.usdt.resourceID;
  
  console.log("Checking current token decimals...");
  
  // Connect to Studio ERC20Handler
  const studioErc20Handler = await ethers.getContractAt("ERC20HandlerFixed", studioDeploymentData.erc20HandlerFixed);
  
  // Check current token decimals on Studio
  try {
    const studioDecimals = await studioErc20Handler.getTokenDecimals(usdtResourceId, studioDeploymentData.chainId);
    console.log(`Current token decimals for USDT on Studio chain: ${studioDecimals}`);
  } catch (error) {
    console.log(`Error getting token decimals on Studio: ${error.message}`);
  }
  
  // Check USDT token decimals directly on Studio
  const studioUsdtAddress = studioDeploymentData.resources.usdt.tokenAddress;
  const studioUsdt = await ethers.getContractAt("IERC20", studioUsdtAddress);
  try {
    const decimals = await studioUsdt.decimals();
    console.log(`Actual USDT token decimals on Studio: ${decimals}`);
  } catch (error) {
    console.log(`Error getting USDT decimals directly on Studio: ${error.message}`);
  }
  
  // Update token decimals on Studio to 6
  console.log("\nUpdating token decimals on Studio to 6...");
  const studioTx = await studioErc20Handler.setTokenDecimals(usdtResourceId, studioDeploymentData.chainId, 6);
  await studioTx.wait();
  console.log("Token decimals updated on Studio.");
  
  // Verify the update
  const studioDecimalsAfter = await studioErc20Handler.getTokenDecimals(usdtResourceId, studioDeploymentData.chainId);
  console.log(`Token decimals for USDT on Studio chain after update: ${studioDecimalsAfter}`);
  
  // Now we need to update the BSC side, but we need to switch networks
  console.log("\nTo update the BSC side, please run the following command:");
  console.log("npx hardhat run scripts/fix-bsc-decimals.js --network bsc");
  
  // Update the relayer configuration
  console.log("\nTo update the relayer configuration, restart the relayer service on the server:");
  console.log("ssh root@173.249.16.253 \"pm2 restart bridge-relayer\"");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
