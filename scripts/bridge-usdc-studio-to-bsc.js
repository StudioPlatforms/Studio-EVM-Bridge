// This script bridges USDC from Studio to BSC
// Usage: npx hardhat run scripts/bridge-usdc-studio-to-bsc.js --network studio
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const { ethers } = hre;

// Wallet address
const WALLET_ADDRESS = "0x846C234adc6D8E74353c0c355b0c2B6a1e46634f";

// Amount to bridge (in USDC)
const AMOUNT_TO_BRIDGE = "10"; // 10 USDC

async function main() {
  try {
    console.log(`Bridging ${AMOUNT_TO_BRIDGE} USDC from Studio to BSC...`);
    
    // Load Studio deployment data
    const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
    const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
    
    // Load BSC deployment data
    const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
    const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
    
    // Get Studio provider
    const studioProvider = ethers.provider;
    
    // Get Studio chain ID
    const studioChainId = studioDeploymentData.chainId;
    console.log(`Studio chain ID: ${studioChainId}`);
    
    // Get BSC chain ID
    const bscChainId = bscDeploymentData.chainId;
    console.log(`BSC chain ID: ${bscChainId}`);
    
    // Get USDC token contract on Studio
    const studioUsdcAddress = studioDeploymentData.resources.usdc.tokenAddress;
    const studioUsdc = await ethers.getContractAt("IERC20", studioUsdcAddress);
    
    // Get USDC resource ID
    const usdcResourceId = studioDeploymentData.resources.usdc.resourceID;
    
    // Get Bridge contract on Studio
    const studioBridgeAddress = studioDeploymentData.bridge;
    const studioBridge = await ethers.getContractAt("Bridge", studioBridgeAddress);
    
    // Get ERC20Handler contract on Studio
    const studioErc20HandlerAddress = studioDeploymentData.erc20HandlerFixed;
    console.log(`Studio ERC20Handler address: ${studioErc20HandlerAddress}`);
    
    // Get the signer
    const [signer] = await ethers.getSigners();
    console.log(`Using account: ${signer.address}`);
    
    // Check USDC balance
    const usdcBalance = await studioUsdc.balanceOf(signer.address);
    
    // Get USDC decimals
    let usdcDecimals = 6; // Default for USDC
    try {
      usdcDecimals = await studioUsdc.decimals();
      console.log(`USDC decimals: ${usdcDecimals}`);
    } catch (error) {
      console.log(`Error getting USDC decimals: ${error.message}`);
      console.log(`Using default decimals: ${usdcDecimals}`);
    }
    
    console.log(`USDC balance: ${ethers.formatUnits(usdcBalance, usdcDecimals)} USDC`);
    
    // Convert amount to units
    const amountInUnits = ethers.parseUnits(AMOUNT_TO_BRIDGE, usdcDecimals);
    
    // Check if we have enough USDC
    if (usdcBalance < amountInUnits) {
      console.error(`Not enough USDC. You have ${ethers.formatUnits(usdcBalance, usdcDecimals)} USDC but need ${AMOUNT_TO_BRIDGE} USDC.`);
      process.exit(1);
    }
    
    // Check allowance
    const allowance = await studioUsdc.allowance(signer.address, studioErc20HandlerAddress);
    console.log(`Current allowance: ${ethers.formatUnits(allowance, usdcDecimals)} USDC`);
    
    // Approve if needed
    if (allowance < amountInUnits) {
      console.log(`Approving ${AMOUNT_TO_BRIDGE} USDC...`);
      
      // Reset allowance to 0 first (some tokens require this)
      if (allowance > 0) {
        console.log(`Resetting allowance to 0 first...`);
        const resetTx = await studioUsdc.approve(studioErc20HandlerAddress, 0);
        console.log(`Reset transaction hash: ${resetTx.hash}`);
        await resetTx.wait();
        console.log(`Reset transaction confirmed.`);
      }
      
      // Approve the new amount
      const approveTx = await studioUsdc.approve(studioErc20HandlerAddress, amountInUnits);
      console.log(`Approve transaction hash: ${approveTx.hash}`);
      await approveTx.wait();
      console.log(`Approve transaction confirmed.`);
      
      // Check new allowance
      const newAllowance = await studioUsdc.allowance(signer.address, studioErc20HandlerAddress);
      console.log(`New allowance: ${ethers.formatUnits(newAllowance, usdcDecimals)} USDC`);
    }
    
    // Prepare deposit data
    const depositData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address"],
      [amountInUnits, WALLET_ADDRESS]
    );
    
    // Estimate gas
    const gasEstimate = await studioBridge.deposit.estimateGas(
      bscChainId,
      usdcResourceId,
      depositData
    );
    console.log(`Gas estimate: ${gasEstimate}`);
    
    // Add 20% buffer to gas estimate
    const gasLimit = Math.floor(gasEstimate * 1.2);
    console.log(`Gas limit with buffer: ${gasLimit}`);
    
    // Bridge USDC
    console.log(`Bridging ${AMOUNT_TO_BRIDGE} USDC to BSC...`);
    const tx = await studioBridge.deposit(
      bscChainId,
      usdcResourceId,
      depositData,
      { gasLimit }
    );
    
    console.log(`Transaction hash: ${tx.hash}`);
    console.log(`Waiting for transaction to be mined...`);
    
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Check for Deposit event
    const depositEvents = receipt.logs
      .filter(log => {
        try {
          return studioBridge.interface.parseLog(log).name === 'Deposit';
        } catch (e) {
          return false;
        }
      })
      .map(log => studioBridge.interface.parseLog(log));
    
    if (depositEvents.length > 0) {
      const event = depositEvents[0];
      console.log(`\nDeposit event emitted:`);
      console.log(`Destination Chain ID: ${event.args.destinationChainId}`);
      console.log(`Resource ID: ${event.args.resourceID}`);
      console.log(`Deposit Nonce: ${event.args.depositNonce}`);
      console.log(`Depositer: ${event.args.depositer}`);
      console.log(`Amount: ${ethers.formatUnits(event.args.amount, usdcDecimals)} USDC`);
      
      console.log(`\nUSCD has been successfully bridged from Studio to BSC!`);
      console.log(`The relayer will pick up this deposit and execute it on the BSC chain.`);
      console.log(`This may take a few minutes. You can check your USDC balance on BSC after that.`);
    } else {
      console.error(`\nNo Deposit event found in the transaction logs.`);
      console.error(`Something might have gone wrong with the bridge transaction.`);
    }
    
  } catch (error) {
    console.error("Error bridging USDC:", error);
    
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
