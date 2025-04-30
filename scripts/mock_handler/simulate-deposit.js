// This script simulates a deposit from the bridge to a specified address
// Usage: npx hardhat run scripts/mock_handler/simulate-deposit.js --network studio [recipient] [amount]
// Example: npx hardhat run scripts/mock_handler/simulate-deposit.js --network studio 0x188Ed01066D35CF6CE9E68c8289bAbb37e5bC219 50
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Default values
const DEFAULT_RECIPIENT = "0x552C8A4cc4c9370328Cbe2E5214BA6E5A7D5d531";
const DEFAULT_AMOUNT = "670.00"; // 50 USDT

async function main() {
  try {
    // Get command line arguments
    const recipient = process.argv[2] || DEFAULT_RECIPIENT;
    const amount = process.argv[3] || DEFAULT_AMOUNT;
    
    console.log(`Simulating deposit of ${amount} USDT to ${recipient}...`);
    
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
    
    // Check if the signer is a bridge admin
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    const handler = ERC20HandlerFixedV2.attach(handlerAddress);
    
    // Get USDT token
    const usdt = await hre.ethers.getContractAt("IERC20", usdtAddress);
    
    // Check USDT balance of the handler
    const handlerBalance = await usdt.balanceOf(handlerAddress);
    console.log(`Handler USDT balance: ${hre.ethers.formatUnits(handlerBalance, 6)} USDT`);
    
    if (handlerBalance < hre.ethers.parseUnits(amount, 6)) {
      console.error(`Handler doesn't have enough USDT. It has ${hre.ethers.formatUnits(handlerBalance, 6)} USDT but needs ${amount} USDT.`);
      process.exit(1);
    }
    
    // Convert amount to wei (USDT has 6 decimals)
    const amountInWei = hre.ethers.parseUnits(amount, 6);
    
    // Encode the data (amount and recipient)
    const data = hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address'],
      [amountInWei, recipient]
    );
    
    console.log(`\nSimulating deposit...`);
    console.log(`Resource ID: ${usdtResourceID}`);
    console.log(`Depositer: ${bridgeAddress}`);
    console.log(`Destination Chain ID: ${studioChainID}`);
    console.log(`Amount: ${amount} USDT (${amountInWei} wei)`);
    console.log(`Recipient: ${recipient}`);
    
    // Call the withdrawTokens function instead of deposit
    console.log(`Using withdrawTokens function to transfer USDT directly...`);
    const tx = await handler.withdrawTokens(
      usdtAddress,
      recipient,
      amountInWei
    );
    
    console.log(`\nTransaction sent: ${tx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`Gas used: ${receipt.gasUsed}`);
    
    // Check if the transaction was successful
    if (receipt.status === 1) {
      console.log(`\nDeposit simulation successful!`);
      
      // Check if the Deposit event was emitted
      const depositEvents = receipt.logs
        .filter(log => log.address === handlerAddress)
        .map(log => {
          try {
            return handler.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter(event => event && event.name === 'Deposit');
      
      if (depositEvents.length > 0) {
        const event = depositEvents[0];
        console.log(`\nDeposit event emitted:`);
        console.log(`Destination Chain ID: ${event.args.destinationChainId}`);
        console.log(`Resource ID: ${event.args.resourceID}`);
        console.log(`Deposit Nonce: ${event.args.depositNonce}`);
        console.log(`Depositer: ${event.args.depositer}`);
        console.log(`Amount: ${event.args.amount}`);
      }
      
      // Check the recipient's USDT balance
      const recipientBalance = await usdt.balanceOf(recipient);
      console.log(`\nRecipient USDT balance: ${hre.ethers.formatUnits(recipientBalance, 6)} USDT`);
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
