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
  
  // Connect to ERC20Handler
  const erc20Handler = await ethers.getContractAt("ERC20HandlerFixed", studioDeploymentData.erc20HandlerFixed);
  
  // Get the USDT token contract
  const usdt = await ethers.getContractAt("IERC20", studioDeploymentData.resources.usdt.tokenAddress);
  
  // Convert amount to the correct units (USDT has 6 decimals on Studio)
  const amountInUnits = ethers.parseUnits(amountUsdt, 6);
  
  console.log(`Withdrawing ${amountUsdt} USDT from handler to ${userAddress}...`);
  
  // Withdraw tokens from the handler to the user
  const tx = await erc20Handler.withdrawTokens(
    studioDeploymentData.resources.usdt.tokenAddress,
    userAddress,
    amountInUnits
  );
  
  console.log(`Transaction hash: ${tx.hash}`);
  await tx.wait();
  
  console.log(`Successfully withdrawn ${amountUsdt} USDT to ${userAddress}`);
  
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