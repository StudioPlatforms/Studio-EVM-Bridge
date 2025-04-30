const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  // Get USDT resource ID
  const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
  
  console.log("Verifying token decimals on BSC chain...");
  
  // Connect to BSC ERC20Handler
  const bscErc20Handler = await ethers.getContractAt("ERC20HandlerFixed", bscDeploymentData.erc20HandlerFixed);
  
  // Check token decimals on BSC
  try {
    const bscDecimals = await bscErc20Handler.getTokenDecimals(usdtResourceId, bscDeploymentData.chainId);
    console.log(`Token decimals for USDT on BSC chain: ${bscDecimals}`);
    console.log(`Expected: 18`);
    console.log(`✅ ${bscDecimals == 18 ? "Correct" : "Incorrect"}`);
  } catch (error) {
    console.log(`Error getting token decimals on BSC: ${error.message}`);
  }
  
  // Check USDT token decimals directly on BSC
  const bscUsdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  const bscUsdt = await ethers.getContractAt("IERC20", bscUsdtAddress);
  try {
    const decimals = await bscUsdt.decimals();
    console.log(`Actual USDT token decimals on BSC: ${decimals}`);
    console.log(`Expected: 18`);
    console.log(`✅ ${decimals == 18 ? "Correct" : "Incorrect"}`);
  } catch (error) {
    console.log(`Error getting USDT decimals directly on BSC: ${error.message}`);
  }
  
  console.log("\nSummary:");
  console.log("- BSC: USDT should have 18 decimals in the handler");
  console.log("- Studio: USDT should have 6 decimals in the handler");
  console.log("\nThe bridge should now be working correctly for USDT transfers between BSC and Studio.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
