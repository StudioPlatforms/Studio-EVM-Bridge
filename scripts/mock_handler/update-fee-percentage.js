// This script updates the fee percentage in the ERC20HandlerFixedV2 contract
// Usage: npx hardhat run scripts/mock_handler/update-fee-percentage.js --network studio [feePercentage]
// Example: npx hardhat run scripts/mock_handler/update-fee-percentage.js --network studio 300
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Default values
const DEFAULT_FEE_PERCENTAGE = 300; // 3%

async function main() {
  try {
    // Get command line arguments
    const feePercentage = parseInt(process.argv[2] || DEFAULT_FEE_PERCENTAGE);
    
    console.log(`Updating fee percentage to ${feePercentage} (${feePercentage / 100}%)...`);
    
    // Load deployment data
    const deploymentFilePath = path.resolve(__dirname, '../../mock_handler/erc20-handler-fixed-v2-deployment.json');
    let deploymentData;
    
    try {
      deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading deployment file: ${error.message}`);
      process.exit(1);
    }
    
    // Get contract address
    const handlerAddress = deploymentData.erc20HandlerFixedV2;
    
    console.log(`Handler address: ${handlerAddress}`);
    
    // Get the network
    const network = await hre.ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get the signer
    const [signer] = await hre.ethers.getSigners();
    console.log(`Using account: ${signer.address}`);
    
    // Get the handler contract
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    const handler = ERC20HandlerFixedV2.attach(handlerAddress);
    
    // Get the current fee percentage
    const currentFeePercentage = await handler._feePercentage();
    console.log(`Current fee percentage: ${currentFeePercentage} (${Number(currentFeePercentage) / 100}%)`);
    
    // Update the fee percentage
    console.log(`\nUpdating fee percentage to ${feePercentage} (${feePercentage / 100}%)...`);
    
    const tx = await handler.setFeePercentage(feePercentage);
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    
    // Check if the transaction was successful
    if (receipt.status === 1) {
      console.log(`\nFee percentage update successful!`);
      
      // Get the new fee percentage
      const newFeePercentage = await handler._feePercentage();
      console.log(`New fee percentage: ${newFeePercentage} (${Number(newFeePercentage) / 100}%)`);
    } else {
      console.error(`\nFee percentage update failed!`);
    }
    
  } catch (error) {
    console.error("Error updating fee percentage:", error);
    
    // Log more details about the error
    if (error.transaction) {
      console.error("Transaction details:");
      console.error(error.transaction);
    }
    
    if (error.receipt) {
      console.error("Transaction receipt:");
      console.error(error.receipt);
    }
    
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
