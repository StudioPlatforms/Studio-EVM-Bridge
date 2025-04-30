// This script withdraws all USDT from the handler to a specified address
// Usage: npx hardhat run scripts/mock_handler/emergency-withdraw.js --network studio [recipient]
// Example: npx hardhat run scripts/mock_handler/emergency-withdraw.js --network studio 0x846C234adc6D8E74353c0c355b0c2B6a1e46634f
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Default values - your own address as default recipient
const DEFAULT_RECIPIENT = "0x846C234adc6D8E74353c0c355b0c2B6a1e46634f";

async function main() {
  try {
    // Get command line arguments
    const recipient = process.argv[2] || DEFAULT_RECIPIENT;
    
    console.log(`Emergency withdraw of all USDT from handler to ${recipient}...`);
    
    // Load deployment data
    const deploymentFilePath = path.resolve(__dirname, '../../mock_handler/erc20-handler-fixed-v2-deployment.json');
    let deploymentData;
    
    try {
      deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading deployment file: ${error.message}`);
      process.exit(1);
    }
    
    // Get contract addresses and resource ID
    const handlerAddress = deploymentData.erc20HandlerFixedV2;
    const usdtAddress = deploymentData.resources.usdt.tokenAddress;
    
    console.log(`Handler address: ${handlerAddress}`);
    console.log(`USDT address: ${usdtAddress}`);
    
    // Get the network
    const network = await hre.ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get the signer
    const [signer] = await hre.ethers.getSigners();
    console.log(`Using account: ${signer.address}`);
    
    // Get the handler contract
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    const handler = ERC20HandlerFixedV2.attach(handlerAddress);
    
    // Get USDT token
    const usdt = await hre.ethers.getContractAt("IERC20", usdtAddress);
    
    // Check USDT balance of the handler
    const handlerBalance = await usdt.balanceOf(handlerAddress);
    console.log(`Handler USDT balance: ${hre.ethers.formatUnits(handlerBalance, 6)} USDT`);
    
    if (handlerBalance == 0n) {
      console.log(`Handler has no USDT to withdraw.`);
      process.exit(0);
    }
    
    // Check recipient's initial balance
    const initialRecipientBalance = await usdt.balanceOf(recipient);
    console.log(`Recipient initial USDT balance: ${hre.ethers.formatUnits(initialRecipientBalance, 6)} USDT`);
    
    console.log(`\nWithdrawing ${hre.ethers.formatUnits(handlerBalance, 6)} USDT to ${recipient}...`);
    
    // Call the withdrawTokens function to withdraw all USDT
    const tx = await handler.withdrawTokens(
      usdtAddress,
      recipient,
      handlerBalance
    );
    
    console.log(`\nTransaction sent: ${tx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    
    // Check if the transaction was successful
    if (receipt.status === 1) {
      console.log(`\nEmergency withdraw successful!`);
      
      // Check the handler's USDT balance after withdrawal
      const newHandlerBalance = await usdt.balanceOf(handlerAddress);
      console.log(`Handler USDT balance after withdrawal: ${hre.ethers.formatUnits(newHandlerBalance, 6)} USDT`);
      
      // Check the recipient's USDT balance after withdrawal
      const newRecipientBalance = await usdt.balanceOf(recipient);
      console.log(`Recipient USDT balance after withdrawal: ${hre.ethers.formatUnits(newRecipientBalance, 6)} USDT`);
      
      // Calculate the amount received
      const amountReceived = newRecipientBalance - initialRecipientBalance;
      console.log(`Amount received: ${hre.ethers.formatUnits(amountReceived, 6)} USDT`);
      
      if (newHandlerBalance == 0n) {
        console.log(`\nAll USDT has been successfully withdrawn from the handler!`);
      } else {
        console.log(`\nWarning: Handler still has ${hre.ethers.formatUnits(newHandlerBalance, 6)} USDT left.`);
      }
    } else {
      console.error(`\nEmergency withdraw failed!`);
    }
    
  } catch (error) {
    console.error("Error during emergency withdraw:", error);
    
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
