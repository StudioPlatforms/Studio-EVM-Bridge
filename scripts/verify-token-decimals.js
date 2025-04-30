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
  
  console.log("Verifying token decimals on Studio chain...");
  
  // Connect to Studio ERC20Handler
  const studioErc20Handler = await ethers.getContractAt("ERC20HandlerFixed", studioDeploymentData.erc20HandlerFixed);
  
  // Check token decimals on Studio
  try {
    const studioDecimals = await studioErc20Handler.getTokenDecimals(usdtResourceId, studioDeploymentData.chainId);
    console.log(`Token decimals for USDT on Studio chain: ${studioDecimals}`);
    console.log(`Expected: 6`);
    console.log(`✅ ${studioDecimals == 6 ? "Correct" : "Incorrect"}`);
  } catch (error) {
    console.log(`Error getting token decimals on Studio: ${error.message}`);
  }
  
  // Check USDT token decimals directly on Studio
  const studioUsdtAddress = studioDeploymentData.resources.usdt.tokenAddress;
  const studioUsdt = await ethers.getContractAt("IERC20", studioUsdtAddress);
  try {
    const decimals = await studioUsdt.decimals();
    console.log(`Actual USDT token decimals on Studio: ${decimals}`);
    console.log(`Expected: 6`);
    console.log(`✅ ${decimals == 6 ? "Correct" : "Incorrect"}`);
  } catch (error) {
    console.log(`Error getting USDT decimals directly on Studio: ${error.message}`);
  }
  
  console.log("\nTo verify the BSC side, please run the following command:");
  console.log("npx hardhat run scripts/verify-bsc-decimals.js --network bsc");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
