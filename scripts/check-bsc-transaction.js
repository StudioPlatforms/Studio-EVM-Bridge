const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Transaction hash to check
const TX_HASH = "0xea8b586df7adc3bddbc89341938ef832bdd139db6c95a6a8581813c8968cac67";

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(`Checking BSC transaction: ${TX_HASH}`);
  
  // Get BSC provider
  const bscProvider = ethers.provider;
  
  // Get transaction receipt
  const txReceipt = await bscProvider.getTransactionReceipt(TX_HASH);
  if (!txReceipt) {
    console.error(`Transaction not found: ${TX_HASH}`);
    return;
  }
  
  console.log(`Transaction status: ${txReceipt.status === 1 ? "Success" : "Failed"}`);
  console.log(`Block number: ${txReceipt.blockNumber}`);
  console.log(`Gas used: ${txReceipt.gasUsed}`);
  
  // Get transaction details
  const tx = await bscProvider.getTransaction(TX_HASH);
  console.log(`From: ${tx.from}`);
  console.log(`To: ${tx.to}`);
  console.log(`Value: ${ethers.formatEther(tx.value)} BNB`);
  
  // Check if the transaction is to the bridge
  const bridgeAddress = bscDeploymentData.bridge;
  console.log(`Bridge address: ${bridgeAddress}`);
  console.log(`Transaction to bridge: ${tx.to.toLowerCase() === bridgeAddress.toLowerCase()}`);
  
  // Get the bridge contract
  const bridge = await ethers.getContractAt("Bridge", bridgeAddress);
  
  // Instead of querying events, let's analyze the transaction logs directly
  console.log(`\nAnalyzing transaction logs...`);
  
  // Define the Deposit event signature
  const depositEventSignature = "Deposit(uint256,bytes32,uint64,address,bytes,uint256,bytes32)";
  const depositEventTopic = ethers.id(depositEventSignature);
  
  // Check if the transaction has a Deposit event
  let hasDepositEvent = false;
  for (const log of txReceipt.logs) {
    if (log.topics[0] === depositEventTopic) {
      hasDepositEvent = true;
      console.log(`Found Deposit event in log`);
      
      // Try to decode the log data
      try {
        // The first topic is the event signature, the rest are indexed parameters
        const destChainID = parseInt(log.topics[1], 16);
        const resourceID = log.topics[2];
        
        console.log(`Destination chain ID: ${destChainID}`);
        console.log(`Resource ID: ${resourceID}`);
        
        // Check if the resource ID is for USDT
        const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
        console.log(`USDT resource ID: ${usdtResourceId}`);
        console.log(`Is USDT transfer: ${resourceID === usdtResourceId}`);
      } catch (error) {
        console.error(`Error decoding log data:`, error);
      }
    }
  }
  
  if (!hasDepositEvent) {
    console.log(`No Deposit event found in transaction logs`);
  }
  
  // Check which handler was used
  console.log(`\nChecking which handler was used...`);
  
  // Check if the transaction was to the regular ERC20Handler
  const erc20HandlerAddress = bscDeploymentData.erc20Handler;
  console.log(`Regular ERC20Handler address: ${erc20HandlerAddress}`);
  
  // Check if the transaction was to the ERC20HandlerFixed
  const erc20HandlerFixedAddress = bscDeploymentData.erc20HandlerFixed;
  console.log(`ERC20HandlerFixed address: ${erc20HandlerFixedAddress}`);
  
  // Check transaction logs to see which handler was involved
  let regularHandlerInvolved = false;
  let fixedHandlerInvolved = false;
  
  for (const log of txReceipt.logs) {
    if (log.address.toLowerCase() === erc20HandlerAddress.toLowerCase()) {
      regularHandlerInvolved = true;
      console.log(`Transaction involved the regular ERC20Handler`);
    }
    if (log.address.toLowerCase() === erc20HandlerFixedAddress.toLowerCase()) {
      fixedHandlerInvolved = true;
      console.log(`Transaction involved the ERC20HandlerFixed`);
    }
  }
  
  if (!regularHandlerInvolved && !fixedHandlerInvolved) {
    console.log(`Neither ERC20Handler nor ERC20HandlerFixed was involved in this transaction`);
  }
  
  console.log(`\nAll transaction logs:`);
  for (const log of txReceipt.logs) {
    console.log(`Log address: ${log.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
