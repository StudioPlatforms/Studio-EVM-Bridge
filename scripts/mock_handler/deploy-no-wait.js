// This script deploys the contract without waiting for confirmation
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Configuration
const STUDIO_CHAIN_ID = 240241;
const BRIDGE_ADDRESS = '0x7FD526dC3d193a3dA6C330956813A6B358BCA1Ff'; // Real bridge address
const USDT_ADDRESS = '0xFcCC20bf4f0829e121bC99FF2222456Ad4465A1E'; // USDT token address
const RATE_LIMITER_ADDRESS = '0xEf66f88082c592F30357AB648CA0d4e26b009A46'; // Rate limiter address

// Resource IDs
const USDT_RESOURCE_ID = '0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0';

// Fee configuration
const FEE_PERCENTAGE = 100; // 1%

async function main() {
  try {
    console.log("Deploying ERC20HandlerFixedV2 without waiting for confirmation...");
    
    // Get the network
    const network = await hre.ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deployer address: ${deployer.address}`);
    
    // Get the deployer balance
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} ETH`);
    
    // Get the current block number
    const blockNumber = await hre.ethers.provider.getBlockNumber();
    console.log(`Current block number: ${blockNumber}`);
    
    // Compile the contract
    console.log("Compiling contracts...");
    await hre.run("compile", { force: true });
    console.log("Contracts compiled successfully");
    
    // Get the contract factory
    console.log("Getting contract factory...");
    const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
    
    // Deploy the contract with explicit gas settings
    console.log(`Deploying contract with parameters: ${BRIDGE_ADDRESS}, ${FEE_PERCENTAGE}`);
    console.log("This may take a moment...");
    
    // Get the gas price
    const feeData = await hre.ethers.provider.getFeeData();
    console.log(`Gas price: ${hre.ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
    
    // Deploy without waiting for confirmation
    const deployTx = await ERC20HandlerFixedV2.getDeployTransaction(
      BRIDGE_ADDRESS,
      FEE_PERCENTAGE
    );
    
    // Set gas price and limit
    deployTx.gasPrice = feeData.gasPrice * 110n / 100n; // 10% higher than current gas price
    deployTx.gasLimit = 5000000;
    
    // Send the transaction
    const tx = await deployer.sendTransaction(deployTx);
    console.log(`Deployment transaction hash: ${tx.hash}`);
    
    // Calculate the contract address
    const contractAddress = hre.ethers.getCreateAddress({
      from: deployer.address,
      nonce: await deployer.getNonce() - 1
    });
    console.log(`Expected contract address: ${contractAddress}`);
    
    // Update deployment file
    console.log('Updating deployment file...');
    
    // Create deployment directory if it doesn't exist
    const deploymentDir = path.resolve(__dirname, '../../mock_handler');
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    // Create deployment data
    const deploymentData = {
      network: 'studio',
      chainId: STUDIO_CHAIN_ID,
      rateLimiter: RATE_LIMITER_ADDRESS,
      bridge: BRIDGE_ADDRESS,
      erc20HandlerFixedV2: contractAddress,
      resources: {
        usdt: {
          resourceID: USDT_RESOURCE_ID,
          tokenAddress: USDT_ADDRESS
        }
      },
      deploymentTransaction: tx.hash,
      updatedAt: new Date().toISOString()
    };
    
    // Write to file
    const deploymentFilePath = path.resolve(deploymentDir, 'erc20-handler-fixed-v2-deployment.json');
    fs.writeFileSync(
      deploymentFilePath,
      JSON.stringify(deploymentData, null, 2)
    );
    
    console.log(`Deployment file updated at: ${deploymentFilePath}`);
    console.log('Deployment transaction sent successfully');
    
    // Print summary
    console.log('\nDeployment Summary:');
    console.log(`ERC20HandlerFixedV2: ${contractAddress}`);
    console.log(`Bridge: ${BRIDGE_ADDRESS}`);
    console.log(`USDT Address: ${USDT_ADDRESS}`);
    console.log(`Transaction Hash: ${tx.hash}`);
    console.log('\nIMPORTANT: The transaction has been sent but not confirmed yet.');
    console.log('You will need to manually check if the transaction was successful.');
    console.log('You can check the transaction status using a block explorer or by running:');
    console.log(`npx hardhat run scripts/check-bsc-transaction.js --network studio ${tx.hash}`);
    console.log('\nAfter the contract is deployed, you will need to configure it by running:');
    console.log(`npx hardhat run scripts/mock_handler/configure-erc20-handler-fixed-v2.js --network studio ${contractAddress}`);
    
  } catch (error) {
    console.error("Deployment failed with error:");
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
