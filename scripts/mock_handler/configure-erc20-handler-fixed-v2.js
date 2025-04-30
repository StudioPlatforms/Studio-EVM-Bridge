// This script configures an already deployed ERC20HandlerFixedV2 contract
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Configuration
const STUDIO_CHAIN_ID = 240241;
const USDT_ADDRESS = '0xFcCC20bf4f0829e121bC99FF2222456Ad4465A1E'; // USDT token address
const RATE_LIMITER_ADDRESS = '0xEf66f88082c592F30357AB648CA0d4e26b009A46'; // Rate limiter address

// Resource IDs
const USDT_RESOURCE_ID = '0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0';

async function main() {
  try {
    // Hardcoded contract address
    const contractAddress = "0xb9cccB99E175E683Fa27dF5Cd688F20BBF6b910f";
    
    console.log(`Configuring ERC20HandlerFixedV2 at ${contractAddress}...`);
    
    // Get the network
    const network = await hre.ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Using account: ${deployer.address}`);
    
    // Get the contract
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    const contract = ERC20HandlerFixedV2.attach(contractAddress);
    
    // Set this chain ID
    console.log(`Setting chain ID to ${STUDIO_CHAIN_ID}...`);
    const setChainIDTx = await contract.setThisChainID(STUDIO_CHAIN_ID);
    console.log(`Transaction hash: ${setChainIDTx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    try {
      // Set a timeout for waiting for the transaction
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000);
      });
      
      // Wait for the transaction with a timeout
      const receipt = await Promise.race([
        setChainIDTx.wait(),
        timeoutPromise
      ]);
      
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    } catch (error) {
      console.log(`Transaction may still be pending: ${error.message}`);
      console.log(`You can check the transaction status using a block explorer.`);
    }
    
    // Set rate limiter
    console.log(`Setting rate limiter to ${RATE_LIMITER_ADDRESS}...`);
    const setRateLimiterTx = await contract.updateRateLimiter(RATE_LIMITER_ADDRESS);
    console.log(`Transaction hash: ${setRateLimiterTx.hash}`);
    
    // Set resource for USDT
    console.log(`Setting resource for USDT (${USDT_RESOURCE_ID} -> ${USDT_ADDRESS})...`);
    const setResourceTx = await contract.setResourceIDToTokenContractAddress(USDT_RESOURCE_ID, USDT_ADDRESS);
    console.log(`Transaction hash: ${setResourceTx.hash}`);
    
    // Auto-detect decimals for USDT
    console.log('Auto-detecting decimals for USDT...');
    const autoDetectDecimalsTx = await contract.autoDetectDecimals(USDT_RESOURCE_ID);
    console.log(`Transaction hash: ${autoDetectDecimalsTx.hash}`);
    
    console.log('\nConfiguration transactions have been sent.');
    console.log('You will need to manually check if the transactions were successful.');
    console.log('You can check the transaction status using a block explorer.');
    
    // Update deployment file
    console.log('Updating deployment file...');
    
    // Create deployment directory if it doesn't exist
    const deploymentDir = path.resolve(__dirname, '../../mock_handler');
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    // Try to read existing deployment data
    const deploymentFilePath = path.resolve(deploymentDir, 'erc20-handler-fixed-v2-deployment.json');
    let deploymentData = {};
    
    if (fs.existsSync(deploymentFilePath)) {
      try {
        deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
      } catch (error) {
        console.log(`Could not read existing deployment file: ${error.message}`);
      }
    }
    
    // Update deployment data
    deploymentData = {
      ...deploymentData,
      network: 'studio',
      chainId: STUDIO_CHAIN_ID,
      rateLimiter: RATE_LIMITER_ADDRESS,
      erc20HandlerFixedV2: contractAddress,
      resources: {
        usdt: {
          resourceID: USDT_RESOURCE_ID,
          tokenAddress: USDT_ADDRESS
        }
      },
      configurationTransactions: {
        setChainID: setChainIDTx.hash,
        setRateLimiter: setRateLimiterTx.hash,
        setResource: setResourceTx.hash,
        autoDetectDecimals: autoDetectDecimalsTx.hash
      },
      updatedAt: new Date().toISOString()
    };
    
    // Write to file
    fs.writeFileSync(
      deploymentFilePath,
      JSON.stringify(deploymentData, null, 2)
    );
    
    console.log(`Deployment file updated at: ${deploymentFilePath}`);
    console.log('Configuration completed');
    
  } catch (error) {
    console.error("Configuration failed with error:");
    console.error(error);
    
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
