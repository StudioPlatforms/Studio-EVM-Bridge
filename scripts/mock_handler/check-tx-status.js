// This script checks the status of a transaction
const hre = require("hardhat");

async function main() {
  try {
    // Transaction hashes from the configuration script
    const txHashes = [
      '0x0851fc7072722e79a2b907481b87873694b714f391206f9c814deba2e6dac5f5', // setChainID
      '0xdc662a1ec96519cd6030dfe177babda379018e85c072fb4be845f23d93cee37c', // updateRateLimiter
      '0x163aa5503ddbd2bac86374a76c7b7e5813816940ecacd6b05ca7483ae2be6485'  // setResourceIDToTokenContractAddress
    ];
    
    // Get the provider
    const provider = hre.ethers.provider;
    
    for (const txHash of txHashes) {
      console.log(`Checking transaction ${txHash}...`);
      
      // Get the transaction
      const tx = await provider.getTransaction(txHash);
      
      if (!tx) {
        console.log(`Transaction not found. It may not have been included in a block yet.`);
        continue;
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
        } else {
          console.log(`\nTransaction failed!`);
        }
      } else {
        console.log(`\nTransaction is still pending. It has not been mined yet.`);
      }
      
      console.log('\n-----------------------------------\n');
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
