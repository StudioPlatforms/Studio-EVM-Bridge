// This script checks the status of a transaction
const hre = require("hardhat");

async function main() {
  try {
    // Hardcoded transaction hash
    const txHash = "0x400beedb5c41f3fad23d40c3123c59bdad6911f882e79ced28bf117a2b8ba5e4";
    
    console.log(`Checking transaction ${txHash}...`);
    
    // Get the provider
    const provider = hre.ethers.provider;
    
    // Get the transaction
    const tx = await provider.getTransaction(txHash);
    
    if (!tx) {
      console.log(`Transaction not found. It may not have been included in a block yet.`);
      process.exit(0);
    }
    
    console.log(`Transaction details:`);
    console.log(`From: ${tx.from}`);
    console.log(`To: ${tx.to || 'Contract creation'}`);
    console.log(`Value: ${hre.ethers.formatEther(tx.value)} ETH`);
    console.log(`Gas price: ${hre.ethers.formatUnits(tx.gasPrice, 'gwei')} gwei`);
    console.log(`Gas limit: ${tx.gasLimit.toString()}`);
    console.log(`Nonce: ${tx.nonce}`);
    
    // Check if the transaction has been mined
    if (tx.blockNumber) {
      console.log(`\nTransaction has been mined in block ${tx.blockNumber}`);
      
      // Get the transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      
      console.log(`Transaction status: ${receipt.status ? 'Success' : 'Failed'}`);
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);
      
      if (receipt.status) {
        console.log(`\nTransaction was successful!`);
        
        // If it's a contract creation transaction
        if (!tx.to) {
          console.log(`Contract created at: ${receipt.contractAddress}`);
        }
      } else {
        console.log(`\nTransaction failed!`);
      }
    } else {
      console.log(`\nTransaction is still pending. It has not been mined yet.`);
    }
    
  } catch (error) {
    console.error("Error checking transaction:", error);
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
