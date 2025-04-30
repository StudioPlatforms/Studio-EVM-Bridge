const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  // Get USDT resource ID
  const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
  
  console.log("Checking current token decimals on BSC...");
  
  // Connect to BSC ERC20Handler
  const bscErc20Handler = await ethers.getContractAt("ERC20HandlerFixed", bscDeploymentData.erc20HandlerFixed);
  
  // Check current token decimals on BSC
  try {
    const bscDecimals = await bscErc20Handler.getTokenDecimals(usdtResourceId, bscDeploymentData.chainId);
    console.log(`Current token decimals for USDT on BSC chain: ${bscDecimals}`);
  } catch (error) {
    console.log(`Error getting token decimals on BSC: ${error.message}`);
  }
  
  // Check USDT token decimals directly on BSC
  const bscUsdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  const bscUsdt = await ethers.getContractAt("IERC20", bscUsdtAddress);
  try {
    const decimals = await bscUsdt.decimals();
    console.log(`Actual USDT token decimals on BSC: ${decimals}`);
  } catch (error) {
    console.log(`Error getting USDT decimals directly on BSC: ${error.message}`);
  }
  
  // Update token decimals on BSC to 18
  console.log("\nUpdating token decimals on BSC to 18...");
  const bscTx = await bscErc20Handler.setTokenDecimals(usdtResourceId, bscDeploymentData.chainId, 18);
  await bscTx.wait();
  console.log("Token decimals updated on BSC.");
  
  // Verify the update
  const bscDecimalsAfter = await bscErc20Handler.getTokenDecimals(usdtResourceId, bscDeploymentData.chainId);
  console.log(`Token decimals for USDT on BSC chain after update: ${bscDecimalsAfter}`);
  
  console.log("\nBoth chains have been updated with the correct token decimals:");
  console.log("- BSC: 18 decimals");
  console.log("- Studio: 6 decimals (if you ran the fix-token-decimals.js script)");
  
  console.log("\nTo update the relayer configuration, restart the relayer service on the server:");
  console.log("ssh root@173.249.16.253 \"pm2 restart bridge-relayer\"");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
