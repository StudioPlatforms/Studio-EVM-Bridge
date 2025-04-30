// This script adds 3D City (3DC) token as a new bridgeable token to the existing bridge
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const { ethers } = hre;

// 3DC token addresses
const BSC_3DC_ADDRESS = "0xA4fb427C67DF2400315c794155401c7C998Ed97d"; // 3DC on BSC
const STUDIO_3DC_ADDRESS = "0xfB0ae661d04f463B43Ae36f9Fd2a7ce95538B5A1"; // 3DC on Studio

// Create a unique resource ID for 3DC
// Resource IDs are 32 bytes, where the last byte is a chain identifier
// We'll use a similar pattern to the USDT and USDC resource IDs but make it unique for 3DC
const DC3_RESOURCE_ID = "0xac1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0";

async function main() {
  try {
    // Get the network
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get the deployer account
    const [deployer] = await ethers.getSigners();
    console.log(`Using account: ${deployer.address}`);
    
    // Load deployment data based on the network
    const deploymentFilePath = network.name === 'bsc' 
      ? path.resolve(__dirname, '../bsc-deployment.json')
      : path.resolve(__dirname, '../studio-deployment.json');
    
    let deploymentData;
    try {
      deploymentData = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading deployment file: ${error.message}`);
      process.exit(1);
    }
    
    // Get contract addresses from deployment data
    const bridgeAddress = deploymentData.bridge;
    
    // Use the correct handler address based on the network
    // For BSC, use erc20Handler; for Studio, use erc20HandlerFixed
    const erc20HandlerAddress = network.name === 'bsc' 
      ? deploymentData.erc20Handler 
      : deploymentData.erc20HandlerFixed;
    
    console.log(`Bridge address: ${bridgeAddress}`);
    console.log(`ERC20Handler address: ${erc20HandlerAddress}`);
    
    // Get the Bridge contract
    const Bridge = await ethers.getContractFactory("Bridge");
    const bridge = Bridge.attach(bridgeAddress);
    
    // Get the ERC20Handler contract
    const ERC20HandlerFixed = await ethers.getContractFactory("ERC20HandlerFixed");
    const erc20Handler = ERC20HandlerFixed.attach(erc20HandlerAddress);
    
    // Determine which 3DC address to use based on the network
    const dc3Address = network.name === 'bsc' ? BSC_3DC_ADDRESS : STUDIO_3DC_ADDRESS;
    console.log(`3DC address: ${dc3Address}`);
    
    // Step 1: Set resource in the ERC20HandlerFixed contract
    console.log(`\nStep 1: Setting resource in ERC20HandlerFixed...`);
    console.log(`Mapping 3DC resource ID (${DC3_RESOURCE_ID}) to 3DC token address (${dc3Address})...`);
    
    const setResourceTx = await erc20Handler.setResource(DC3_RESOURCE_ID, dc3Address);
    console.log(`Transaction hash: ${setResourceTx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    const setResourceReceipt = await setResourceTx.wait();
    console.log(`Transaction confirmed in block ${setResourceReceipt.blockNumber}`);
    
    // Step 2: Set resource in the Bridge contract
    console.log(`\nStep 2: Setting resource in Bridge...`);
    console.log(`Mapping 3DC resource ID (${DC3_RESOURCE_ID}) to ERC20Handler (${erc20HandlerAddress})...`);
    
    // Add gas price options for BSC
    const txOptions = network.name === 'bsc' 
      ? { 
          gasPrice: ethers.parseUnits('5', 'gwei'),  // 5 gwei should be enough
          gasLimit: 500000  // Increase gas limit as well
        } 
      : {};
    
    // Log transaction options (convert BigInt to string for logging)
    const logOptions = network.name === 'bsc' 
      ? { 
          gasPrice: ethers.parseUnits('5', 'gwei').toString(),
          gasLimit: 500000
        } 
      : {};
    console.log(`Using transaction options: ${JSON.stringify(logOptions)}`);
    
    const setBridgeResourceTx = await bridge.setResource(DC3_RESOURCE_ID, erc20HandlerAddress, txOptions);
    console.log(`Transaction hash: ${setBridgeResourceTx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    const setBridgeResourceReceipt = await setBridgeResourceTx.wait();
    console.log(`Transaction confirmed in block ${setBridgeResourceReceipt.blockNumber}`);
    
    // Step 3: Set token decimals
    console.log(`\nStep 3: Setting token decimals...`);
    
    // Auto-detect decimals
    console.log(`Auto-detecting decimals for 3DC...`);
    const autoDetectDecimalsTx = await erc20Handler.autoDetectDecimals(DC3_RESOURCE_ID, txOptions);
    console.log(`Transaction hash: ${autoDetectDecimalsTx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    const autoDetectDecimalsReceipt = await autoDetectDecimalsTx.wait();
    console.log(`Transaction confirmed in block ${autoDetectDecimalsReceipt.blockNumber}`);
    
    // Get the detected decimals
    const decimals = await erc20Handler.getTokenDecimals(DC3_RESOURCE_ID, deploymentData.chainId);
    console.log(`Detected decimals for 3DC: ${decimals}`);
    
    // Step 4: Update deployment file
    console.log(`\nStep 4: Updating deployment file...`);
    
    // Add 3DC to resources
    deploymentData.resources.dc3 = {
      resourceID: DC3_RESOURCE_ID,
      tokenAddress: dc3Address
    };
    
    // Update the timestamp
    deploymentData.updatedAt = new Date().toISOString();
    
    // Write to file
    fs.writeFileSync(
      deploymentFilePath,
      JSON.stringify(deploymentData, null, 2)
    );
    
    console.log(`Deployment file updated at: ${deploymentFilePath}`);
    
    console.log(`\n3DC has been successfully added to the bridge on ${network.name}!`);
    console.log(`Resource ID: ${DC3_RESOURCE_ID}`);
    console.log(`Token Address: ${dc3Address}`);
    console.log(`Decimals: ${decimals}`);
    
    console.log(`\nIMPORTANT: You need to run this script on both chains (BSC and Studio) to complete the setup.`);
    
  } catch (error) {
    console.error("Error adding 3DC to bridge:", error);
    
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
