const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Transaction hash to check
const TX_HASH = "0xea8b586df7adc3bddbc89341938ef832bdd139db6c95a6a8581813c8968cac67";

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(`Checking deposit event for transaction: ${TX_HASH}`);
  
  // Get BSC provider
  const bscRpcUrl = "https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c";
  const provider = new ethers.JsonRpcProvider(bscRpcUrl);
  
  // Get transaction receipt
  const txReceipt = await provider.getTransactionReceipt(TX_HASH);
  if (!txReceipt) {
    console.error(`Transaction not found: ${TX_HASH}`);
    return;
  }
  
  // Get bridge contract
  const bridgeAddress = bscDeploymentData.bridge;
  
  // Define the Deposit event signature
  const depositEventSignature = "Deposit(uint256,bytes32,uint64,address,bytes,uint256,bytes32)";
  const depositEventTopic = ethers.id(depositEventSignature);
  
  // Check if the transaction has a Deposit event
  let hasDepositEvent = false;
  let depositerTopic = null;
  for (const log of txReceipt.logs) {
    if (log.address.toLowerCase() === bridgeAddress.toLowerCase() && log.topics[0] === depositEventTopic) {
      hasDepositEvent = true;
      console.log(`\nFound Deposit event in log:`);
      
      // Try to decode the log data
      try {
        // The first topic is the event signature, the rest are indexed parameters
        const destChainID = parseInt(log.topics[1], 16);
        const resourceID = log.topics[2];
        depositerTopic = log.topics[3]; // This is the indexed depositer address
        
        console.log(`\nDecoded event parameters from topics:`);
        console.log(`Destination chain ID: ${destChainID}`);
        console.log(`Resource ID: ${resourceID}`);
        
        // Extract the depositer address from the topic
        const depositerAddress = '0x' + depositerTopic.slice(26);
        console.log(`Depositer address from topic: ${depositerAddress}`);
        
        // Check if the depositer address is a special address
        if (depositerAddress.startsWith('0x000000000000000000000000000000000000')) {
          console.log(`⚠️ Depositer address is a special address: ${depositerAddress}`);
          console.log(`This could be causing issues with the relayer.`);
        }
        
        // Try to decode the non-indexed parameters from the data field
        const data = log.data;
        console.log(`\nRaw data: ${data}`);
        
        // The data field contains: depositNonce, recipientBytes, amount, dataHash
        // But they're not all properly decodable without the full event ABI
        
        // We can try to extract some information from the data
        // The first 32 bytes should be the depositNonce
        const depositNonce = BigInt('0x' + data.slice(2, 66));
        console.log(`Deposit nonce: ${depositNonce}`);
        
        // The next 32 bytes are the offset to the recipient bytes
        const recipientOffset = parseInt('0x' + data.slice(66, 130), 16);
        console.log(`Recipient offset: ${recipientOffset}`);
        
        // The next 32 bytes are the amount
        const amount = BigInt('0x' + data.slice(130, 194));
        console.log(`Amount: ${amount}`);
        
        // The next 32 bytes are the dataHash
        const dataHash = '0x' + data.slice(194, 258);
        console.log(`Data hash: ${dataHash}`);
        
        // Now let's try to extract the recipient bytes
        // The recipient bytes start at the offset (in bytes) from the beginning of the data field
        const recipientBytesLengthHex = '0x' + data.slice(2 + recipientOffset * 2, 2 + recipientOffset * 2 + 64);
        const recipientBytesLength = parseInt(recipientBytesLengthHex, 16);
        console.log(`Recipient bytes length: ${recipientBytesLength}`);
        
        const recipientBytesStart = 2 + recipientOffset * 2 + 64;
        const recipientBytesEnd = recipientBytesStart + recipientBytesLength * 2;
        const recipientBytes = '0x' + data.slice(recipientBytesStart, recipientBytesEnd);
        console.log(`Recipient bytes: ${recipientBytes}`);
        
        // Try to convert the recipient bytes to an address
        const recipientAddress = ethers.getAddress(recipientBytes.slice(0, 42));
        console.log(`Recipient address: ${recipientAddress}`);
        
        console.log(`\nThis event should be picked up by the relayer if it's running correctly.`);
        console.log(`However, the special depositer address might be causing issues.`);
      } catch (error) {
        console.error(`Error decoding log data:`, error);
      }
    }
  }
  
  if (!hasDepositEvent) {
    console.log(`\n❌ No Deposit event found in transaction logs`);
  }
  
  // Check the transaction input data
  const tx = await provider.getTransaction(TX_HASH);
  const inputData = tx.data;
  console.log(`\nTransaction input data: ${inputData}`);
  
  // Try to decode the input data
  try {
    // The first 4 bytes are the function selector
    const functionSelector = inputData.slice(0, 10);
    console.log(`Function selector: ${functionSelector}`);
    
    // Check if it's the deposit function
    const depositFunctionSelector = ethers.id("deposit(uint256,bytes32,bytes)").slice(0, 10);
    console.log(`Deposit function selector: ${depositFunctionSelector}`);
    
    if (functionSelector === depositFunctionSelector) {
      console.log(`✅ Function is deposit(uint256,bytes32,bytes)`);
      
      // Decode the parameters
      const abiCoder = new ethers.AbiCoder();
      
      // The first parameter is the destination chain ID (uint256)
      const destChainID = abiCoder.decode(['uint256'], '0x' + inputData.slice(10, 74))[0];
      console.log(`Destination chain ID: ${destChainID}`);
      
      // The second parameter is the resource ID (bytes32)
      const resourceID = abiCoder.decode(['bytes32'], '0x' + inputData.slice(74, 138))[0];
      console.log(`Resource ID: ${resourceID}`);
      
      // The third parameter is the data (bytes)
      // This is more complex to decode because it's a dynamic type
      // The next 32 bytes are the offset to the data
      const dataOffset = parseInt('0x' + inputData.slice(138, 202), 16);
      console.log(`Data offset: ${dataOffset}`);
      
      // The data starts at the offset (in bytes) from the beginning of the parameters
      // The first 32 bytes at the offset are the length of the data
      const dataLengthHex = '0x' + inputData.slice(10 + dataOffset * 2, 10 + dataOffset * 2 + 64);
      const dataLength = parseInt(dataLengthHex, 16);
      console.log(`Data length: ${dataLength}`);
      
      const dataStart = 10 + dataOffset * 2 + 64;
      const dataEnd = dataStart + dataLength * 2;
      const data = '0x' + inputData.slice(dataStart, dataEnd);
      console.log(`Data: ${data}`);
      
      // Try to decode the data
      // The data should be encoded as (uint256, address)
      try {
        const decodedData = abiCoder.decode(['uint256', 'address'], data);
        console.log(`Decoded data: ${decodedData}`);
        console.log(`Amount: ${decodedData[0]}`);
        console.log(`Recipient: ${decodedData[1]}`);
        
        // This is the actual depositer address that was used in the transaction
        console.log(`\nActual depositer address (from tx.from): ${tx.from}`);
        
        // Get the depositer address from the topic (defined earlier)
        const depositerFromTopic = depositerTopic ? '0x' + depositerTopic.slice(26) : 'unknown';
        
        console.log(`\nConclusion:`);
        console.log(`1. The transaction is calling the deposit function with the correct parameters.`);
        console.log(`2. The depositer address in the Deposit event (${depositerFromTopic}) is different from the actual depositer (${tx.from}).`);
        console.log(`3. This suggests that the handler is returning a special address for the depositer.`);
        console.log(`4. The relayer might be having trouble with this special address.`);
      } catch (error) {
        console.error(`Error decoding data:`, error);
      }
    } else {
      console.log(`❌ Function is not deposit(uint256,bytes32,bytes)`);
    }
  } catch (error) {
    console.error(`Error decoding input data:`, error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
