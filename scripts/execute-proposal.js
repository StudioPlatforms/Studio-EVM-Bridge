const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  // User address and amount
  const userAddress = "0x592EdbbB93A74D4A9cde0d22a209e29Bd0f4432E";
  const amountUsdt = "100.783";
  const bscChainId = 56;
  
  // Connect to Bridge
  const bridge = await ethers.getContractAt("Bridge", studioDeploymentData.bridge);
  
  // Get the USDT resource ID
  const usdtResourceId = studioDeploymentData.resources.usdt.resourceID;
  
  // Convert amount to the correct units (USDT has 6 decimals on Studio)
  const amountInUnits = ethers.parseUnits(amountUsdt, 6);
  
  console.log(`Executing proposal for ${amountUsdt} USDT to ${userAddress}...`);
  
  // Encode the proposal data
  const data = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "address"],
    [amountInUnits, userAddress, userAddress]
  );
  
  // Execute the proposal
  const tx = await bridge.executeProposal(
    bscChainId,
    studioDeploymentData.chainId,
    usdtResourceId,
    data
  );
  
  console.log(`Transaction hash: ${tx.hash}`);
  await tx.wait();
  
  console.log(`Successfully executed proposal for ${amountUsdt} USDT to ${userAddress}`);
  
  // Get the USDT token contract
  const usdt = await ethers.getContractAt("IERC20", studioDeploymentData.resources.usdt.tokenAddress);
  
  // Check the user's balance
  const userBalance = await usdt.balanceOf(userAddress);
  console.log(`User's USDT balance: ${ethers.formatUnits(userBalance, 6)} USDT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });