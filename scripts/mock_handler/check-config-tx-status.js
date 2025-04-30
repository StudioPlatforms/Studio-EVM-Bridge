// This script checks the status of the configuration transactions
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Read deployment file to get transaction hashes
    const deploymentFilePath = path.resolve(__dirname, '../../mock_handler/erc20-handler-fixed-v2-deployment.json');
    let deploymentData = {};
    
    if (fs.existsSync(deploymentFilePath)) {
      try {
        deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
      } catch (error) {
        console.log(`Could not read deployment file: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log(`Deployment file not found at ${deploymentFilePath}`);
      process.exit(1);
    }
    
    // Get the transaction hashes from the deployment output
    const txHashes = [
      '0xe37df635a520df374aa4c855c272b876a826111da56c6897254c0586df738a41', // setChainID
      '0x322f04d2c8dadb5c07a92d15bf6c33726473368b77cf49bb823ebb669e45187c', // updateRateLimiter
      '0x74a96660def260fb86b6a760901745bec9d1fb816d5f11e8b33ec1de60b3dd33', // setResourceIDToTokenContractAddress
      '0xf05a2e050d5a004845bdd56ed810501c5f8300b82a932add17b347176596faeb'  // autoDetectDecimals
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
