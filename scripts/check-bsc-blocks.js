const { ethers } = require("hardhat");

// Transaction hash to check
const TX_HASH = "0xea8b586df7adc3bddbc89341938ef832bdd139db6c95a6a8581813c8968cac67";

async function main() {
  // Get BSC provider
  const bscProvider = ethers.provider;
  
  // Get current block number
  const currentBlock = await bscProvider.getBlockNumber();
  console.log(`Current block number on BSC: ${currentBlock}`);
  
  // Get transaction receipt
  const txReceipt = await bscProvider.getTransactionReceipt(TX_HASH);
  if (!txReceipt) {
    console.error(`Transaction not found: ${TX_HASH}`);
    return;
  }
  
  console.log(`Transaction block number: ${txReceipt.blockNumber}`);
  console.log(`Blocks since transaction: ${currentBlock - txReceipt.blockNumber}`);
  
  // Check if the transaction is too old for the relayer to pick up
  // The relayer uses a startBlockOffset of 5 for BSC
  console.log(`\nRelayer configuration:`);
  console.log(`BSC startBlockOffset: 5`);
  console.log(`Minimum offset for BSC: 3000`);
  console.log(`Effective offset: 3000`);
  
  if (currentBlock - txReceipt.blockNumber > 3000) {
    console.log(`\nThe transaction is ${currentBlock - txReceipt.blockNumber} blocks old, which is more than the effective offset (3000).`);
    console.log(`This means the relayer might have missed this transaction because it's too old.`);
  } else {
    console.log(`\nThe transaction is ${currentBlock - txReceipt.blockNumber} blocks old, which is within the effective offset (3000).`);
    console.log(`The relayer should be able to pick up this transaction.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
