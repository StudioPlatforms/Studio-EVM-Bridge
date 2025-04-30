const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Parse command line arguments
const args = process.argv.slice(2);
let TX_HASH = "0xea8b586df7adc3bddbc89341938ef832bdd139db6c95a6a8581813c8968cac67";

// Check if a transaction hash was provided
if (args.length > 0) {
  const txHashIndex = args.findIndex(arg => arg === '--tx');
  if (txHashIndex !== -1 && args.length > txHashIndex + 1) {
    TX_HASH = args[txHashIndex + 1];
  }
}

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(`Checking BSC transaction: ${TX_HASH}`);
  
  // Get BSC provider
  const bscRpcUrl = "https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c";
  const provider = new ethers.JsonRpcProvider(bscRpcUrl);
  
  // Get transaction receipt
  const txReceipt = await provider.getTransactionReceipt(TX_HASH);
  if (!txReceipt) {
    console.error(`Transaction not found: ${TX_HASH}`);
    return;
  }
  
  console.log(`Transaction status: ${txReceipt.status === 1 ? "Success" : "Failed"}`);
  console.log(`Block number: ${txReceipt.blockNumber}`);
  console.log(`Gas used: ${txReceipt.gasUsed}`);
  
  // Get transaction details
  const tx = await provider.getTransaction(TX_HASH);
  console.log(`From: ${tx.from}`);
  console.log(`To: ${tx.to}`);
  console.log(`Value: ${ethers.formatEther(tx.value)} BNB`);
  
  // Check if the transaction is to the bridge
  const bridgeAddress = bscDeploymentData.bridge;
  console.log(`Bridge address: ${bridgeAddress}`);
  console.log(`Transaction to bridge: ${tx.to.toLowerCase() === bridgeAddress.toLowerCase()}`);
  
  // Define the Deposit event signature
  const depositEventSignature = "Deposit(uint256,bytes32,uint64,address,bytes,uint256,bytes32)";
  const depositEventTopic = ethers.id(depositEventSignature);
  
  console.log(`\nLooking for Deposit events with topic: ${depositEventTopic}`);
  
  // Check if the transaction has a Deposit event
  let hasDepositEvent = false;
  for (const log of txReceipt.logs) {
    if (log.topics[0] === depositEventTopic) {
      hasDepositEvent = true;
      console.log(`\nFound Deposit event in log:`);
      console.log(`Log address: ${log.address}`);
      console.log(`Log topics: ${log.topics}`);
      
      // Try to decode the log data
      try {
        // The first topic is the event signature, the rest are indexed parameters
        const destChainID = parseInt(log.topics[1], 16);
        const resourceID = log.topics[2];
        
        console.log(`\nDecoded event parameters:`);
        console.log(`Destination chain ID: ${destChainID}`);
        console.log(`Resource ID: ${resourceID}`);
        
        // Check if the resource ID is for USDT
        const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
        console.log(`USDT resource ID: ${usdtResourceId}`);
        console.log(`Is USDT transfer: ${resourceID === usdtResourceId}`);
        
        // Check if the destination chain ID is for Studio
        console.log(`Is destination Studio chain: ${destChainID === 240241}`);
        
        // Try to decode the non-indexed parameters from the data field
        const abiCoder = new ethers.AbiCoder();
        const data = log.data;
        
        // The data field contains: depositNonce, depositer, recipient, amount, dataHash
        // But they're not all properly decodable without the full event ABI
        console.log(`\nRaw data: ${data}`);
        
        // We can try to extract some information from the data
        // The first 32 bytes should be the depositNonce
        const depositNonce = BigInt('0x' + data.slice(2, 66));
        console.log(`Deposit nonce: ${depositNonce}`);
        
        // The next 32 bytes should be the depositer address (padded)
        const depositerPadded = '0x' + data.slice(66, 130);
        const depositer = ethers.getAddress('0x' + depositerPadded.slice(26));
        console.log(`Depositer: ${depositer}`);
        
        // The rest is more complex to decode without the full ABI
        console.log(`\nThis event should be picked up by the relayer if it's running correctly.`);
      } catch (error) {
        console.error(`Error decoding log data:`, error);
      }
    }
  }
  
  if (!hasDepositEvent) {
    console.log(`\n❌ No Deposit event found in transaction logs`);
    console.log(`This could be why the relayer is not picking up the transaction.`);
    
    // Print all logs to help debug
    console.log(`\nAll transaction logs:`);
    for (const log of txReceipt.logs) {
      console.log(`Log address: ${log.address}`);
      console.log(`Log topics: ${log.topics}`);
      console.log(`Log data: ${log.data}`);
      console.log(`---`);
    }
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
  
  // Check if the relayer is running and polling for events
  console.log(`\nThe relayer should be polling for events on BSC chain.`);
  console.log(`If the relayer is running correctly, it should pick up this Deposit event and submit a proposal to the Studio chain.`);
  console.log(`If the relayer is not picking up the event, check the following:`);
  console.log(`1. Is the relayer running? Check the PM2 logs.`);
  console.log(`2. Is the relayer configured correctly? Check multichain.config.ts.`);
  console.log(`3. Is the relayer registered on both chains? We verified this is true.`);
  console.log(`4. Is the relayer using the correct ABI? Check the minimalBridgeAbi in multichain-relayer-fixed-nonce.ts.`);
  console.log(`5. Is the relayer polling the correct blocks? Check the startBlockOffset in multichain.config.ts.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
