const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// New fee percentage
const NEW_FEE_PERCENTAGE = 300; // 3%

async function main() {
  // Load deployment info
  const deploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error("Deployment file not found. Please deploy the contracts first.");
    process.exit(1);
  }

  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  console.log("Updating bridge fee percentage...");
  
  // Connect to contracts
  const erc20HandlerFixed = await ethers.getContractAt("ERC20HandlerFixed", deploymentData.erc20HandlerFixed);
  const nativeHandler = await ethers.getContractAt("NativeHandler", deploymentData.nativeHandler);
  
  // Get current fee percentages
  const currentErc20Fee = await erc20HandlerFixed._feePercentage();
  const currentNativeFee = await nativeHandler._feePercentage();
  
  console.log(`Current ERC20HandlerFixed fee percentage: ${currentErc20Fee} (${Number(currentErc20Fee) / 100}%)`);
  console.log(`Current NativeHandler fee percentage: ${currentNativeFee} (${Number(currentNativeFee) / 100}%)`);
  
  // Update fee percentages
  console.log(`\nUpdating fee percentages to ${NEW_FEE_PERCENTAGE} (${NEW_FEE_PERCENTAGE / 100}%)...`);
  
  // Update ERC20HandlerFixed fee
  console.log("Updating ERC20HandlerFixed fee...");
  const erc20Tx = await erc20HandlerFixed.setFeePercentage(NEW_FEE_PERCENTAGE);
  await erc20Tx.wait();
  console.log("ERC20HandlerFixed fee updated successfully.");
  
  // Update NativeHandler fee
  console.log("Updating NativeHandler fee...");
  const nativeTx = await nativeHandler.setFeePercentage(NEW_FEE_PERCENTAGE);
  await nativeTx.wait();
  console.log("NativeHandler fee updated successfully.");
  
  // Verify new fee percentages
  const newErc20Fee = await erc20HandlerFixed._feePercentage();
  const newNativeFee = await nativeHandler._feePercentage();
  
  console.log(`\nNew ERC20HandlerFixed fee percentage: ${newErc20Fee} (${Number(newErc20Fee) / 100}%)`);
  console.log(`New NativeHandler fee percentage: ${newNativeFee} (${Number(newNativeFee) / 100}%)`);
  
  console.log("\nBridge fee percentage updated successfully!");
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
