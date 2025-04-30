// This script simulates a deposit from the bridge to a specified address with proper fee handling
// Usage: npx hardhat run scripts/mock_handler/simulate-deposit-with-fee.js --network studio [recipient] [amount]
// Example: npx hardhat run scripts/mock_handler/simulate-deposit-with-fee.js --network studio 0x188Ed01066D35CF6CE9E68c8289bAbb37e5bC219 50
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Default values
const DEFAULT_RECIPIENT = "0xE6C2cd17d4FDB10da85e3dbe2e4ce57C610a0ed5";
const DEFAULT_AMOUNT = "49"; // 50 USDT

async function main() {
  try {
    // Get command line arguments
    const recipient = process.argv[2] || DEFAULT_RECIPIENT;
    const amount = process.argv[3] || DEFAULT_AMOUNT;
    
    console.log(`Simulating deposit of ${amount} USDT to ${recipient} with proper fee handling...`);
    
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
    const bridgeAddress = deploymentData.bridgeAddress;
    const usdtResourceID = deploymentData.resources.usdt.resourceID;
    const usdtAddress = deploymentData.resources.usdt.tokenAddress;
    const studioChainID = deploymentData.chainId;
    
    console.log(`Handler address: ${handlerAddress}`);
    console.log(`Bridge address: ${bridgeAddress}`);
    console.log(`USDT resource ID: ${usdtResourceID}`);
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
      console.error(`Handler doesn't have any USDT. Please send some USDT to the handler first.`);
      process.exit(1);
    }
    
    // Convert amount to wei (USDT has 6 decimals)
    const amountInWei = hre.ethers.parseUnits(amount, 6);
    
    if (handlerBalance < amountInWei) {
      console.error(`Handler doesn't have enough USDT. It has ${hre.ethers.formatUnits(handlerBalance, 6)} USDT but needs ${amount} USDT.`);
      process.exit(1);
    }
    
    // Get the fee percentage
    const feePercentage = await handler._feePercentage();
    console.log(`Fee percentage: ${feePercentage} (${Number(feePercentage) / 100}%)`);
    
    // Calculate the fee
    const fee = (amountInWei * feePercentage) / 10000n;
    console.log(`Fee amount: ${hre.ethers.formatUnits(fee, 6)} USDT`);
    
    // Calculate the amount after fee
    const amountAfterFee = amountInWei - fee;
    console.log(`Amount after fee: ${hre.ethers.formatUnits(amountAfterFee, 6)} USDT`);
    
    // Check recipient's initial balance
    const initialRecipientBalance = await usdt.balanceOf(recipient);
    console.log(`Recipient initial USDT balance: ${hre.ethers.formatUnits(initialRecipientBalance, 6)} USDT`);
    
    // Check bridge's initial balance
    const initialBridgeBalance = await usdt.balanceOf(bridgeAddress);
    console.log(`Bridge initial USDT balance: ${hre.ethers.formatUnits(initialBridgeBalance, 6)} USDT`);
    
    console.log(`\nSimulating deposit...`);
    console.log(`1. Transferring fee (${hre.ethers.formatUnits(fee, 6)} USDT) to bridge...`);
    
    // Transfer fee to bridge
    const feeTx = await handler.withdrawTokens(
      usdtAddress,
      bridgeAddress,
      fee
    );
    
    console.log(`Fee transaction sent: ${feeTx.hash}`);
    console.log(`Waiting for fee transaction to be mined...`);
    
    // Wait for the fee transaction to be mined
    const feeReceipt = await feeTx.wait();
    
    console.log(`Fee transaction confirmed in block ${feeReceipt.blockNumber}`);
    console.log(`Gas used: ${feeReceipt.gasUsed}`);
    
    console.log(`\n2. Transferring amount after fee (${hre.ethers.formatUnits(amountAfterFee, 6)} USDT) to recipient...`);
    
    // Transfer amount after fee to recipient
    const transferTx = await handler.withdrawTokens(
      usdtAddress,
      recipient,
      amountAfterFee
    );
    
    console.log(`Transfer transaction sent: ${transferTx.hash}`);
    console.log(`Waiting for transfer transaction to be mined...`);
    
    // Wait for the transfer transaction to be mined
    const transferReceipt = await transferTx.wait();
    
    console.log(`Transfer transaction confirmed in block ${transferReceipt.blockNumber}`);
    console.log(`Gas used: ${transferReceipt.gasUsed}`);
    
    // Check if the transactions were successful
    if (feeReceipt.status === 1 && transferReceipt.status === 1) {
      console.log(`\nDeposit simulation successful!`);
      
      // Check the recipient's USDT balance after transfer
      const newRecipientBalance = await usdt.balanceOf(recipient);
      console.log(`Recipient USDT balance after transfer: ${hre.ethers.formatUnits(newRecipientBalance, 6)} USDT`);
      console.log(`Recipient received: ${hre.ethers.formatUnits(newRecipientBalance - initialRecipientBalance, 6)} USDT`);
      
      // Check the bridge's USDT balance after transfer
      const newBridgeBalance = await usdt.balanceOf(bridgeAddress);
      console.log(`Bridge USDT balance after transfer: ${hre.ethers.formatUnits(newBridgeBalance, 6)} USDT`);
      console.log(`Bridge received: ${hre.ethers.formatUnits(newBridgeBalance - initialBridgeBalance, 6)} USDT`);
      
      // Check the handler's USDT balance after transfer
      const newHandlerBalance = await usdt.balanceOf(handlerAddress);
      console.log(`Handler USDT balance after transfer: ${hre.ethers.formatUnits(newHandlerBalance, 6)} USDT`);
      console.log(`Handler spent: ${hre.ethers.formatUnits(handlerBalance - newHandlerBalance, 6)} USDT`);
      
      console.log(`\nSummary:`);
      console.log(`- Total amount: ${amount} USDT`);
      console.log(`- Fee (${Number(feePercentage) / 100}%): ${hre.ethers.formatUnits(fee, 6)} USDT (sent to bridge)`);
      console.log(`- Amount after fee: ${hre.ethers.formatUnits(amountAfterFee, 6)} USDT (sent to recipient)`);
    } else {
      console.error(`\nDeposit simulation failed!`);
    }
    
  } catch (error) {
    console.error("Error simulating deposit:", error);
    
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
