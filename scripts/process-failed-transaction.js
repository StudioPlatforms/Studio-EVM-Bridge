const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Transaction details from BSC
const BSC_TX_HASH = "0xcac64614067e4c0e2138ecfd595ac4b421db8820597c9faefaa170d4ad73dc7c";
const USER_ADDRESS = "0x592EdbbB93A74D4A9cde0d22a209e29Bd0f4432E";
const AMOUNT_USDT = "100.783"; // 103.9 - 3.117 (after 3% fee)

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  // Get USDT address on Studio
  const usdtAddress = studioDeploymentData.resources.usdt.resourceID;
  
  console.log(`Processing failed transaction ${BSC_TX_HASH}`);
  console.log(`User address: ${USER_ADDRESS}`);
  console.log(`Amount: ${AMOUNT_USDT} USDT`);
  
  // Connect to Studio ERC20Handler
  const erc20Handler = await ethers.getContractAt("ERC20HandlerFixed", studioDeploymentData.erc20HandlerFixed);
  
  // Get the USDT token contract
  const usdt = await ethers.getContractAt("IERC20", studioDeploymentData.resources.usdt.tokenAddress);
  
  // Check if the handler has enough USDT
  const handlerBalance = await usdt.balanceOf(studioDeploymentData.erc20HandlerFixed);
  console.log(`Handler USDT balance: ${ethers.formatUnits(handlerBalance, 6)} USDT`);
  
  // Convert amount to the correct units (USDT has 6 decimals on Studio)
  const amountInUnits = ethers.parseUnits(AMOUNT_USDT, 6);
  console.log(`Amount in units: ${amountInUnits}`);
  
  if (handlerBalance < amountInUnits) {
    console.error(`Handler doesn't have enough USDT. Need ${AMOUNT_USDT} USDT but only has ${ethers.formatUnits(handlerBalance, 6)} USDT`);
    return;
  }
  
  // There are two options to process this transaction:
  
  // Option 1: Use the bridge admin to withdraw tokens from the handler
  console.log("\nOption 1: Withdraw tokens from the handler as admin");
  console.log("Execute the following command to withdraw tokens:");
  console.log(`npx hardhat run scripts/withdraw-from-handler.js --network studio`);
  
  // Option 2: Manually execute the proposal on the bridge
  console.log("\nOption 2: Manually execute the proposal on the bridge");
  console.log("Execute the following command to execute the proposal:");
  console.log(`npx hardhat run scripts/execute-proposal.js --network studio`);
  
  // Create the withdraw script
  const withdrawScript = `const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  // User address and amount
  const userAddress = "${USER_ADDRESS}";
  const amountUsdt = "${AMOUNT_USDT}";
  
  // Connect to ERC20Handler
  const erc20Handler = await ethers.getContractAt("ERC20HandlerFixed", studioDeploymentData.erc20HandlerFixed);
  
  // Get the USDT token contract
  const usdt = await ethers.getContractAt("IERC20", studioDeploymentData.resources.usdt.tokenAddress);
  
  // Convert amount to the correct units (USDT has 6 decimals on Studio)
  const amountInUnits = ethers.parseUnits(amountUsdt, 6);
  
  console.log(\`Withdrawing \${amountUsdt} USDT from handler to \${userAddress}...\`);
  
  // Withdraw tokens from the handler to the user
  const tx = await erc20Handler.withdrawTokens(
    studioDeploymentData.resources.usdt.tokenAddress,
    userAddress,
    amountInUnits
  );
  
  console.log(\`Transaction hash: \${tx.hash}\`);
  await tx.wait();
  
  console.log(\`Successfully withdrawn \${amountUsdt} USDT to \${userAddress}\`);
  
  // Check the user's balance
  const userBalance = await usdt.balanceOf(userAddress);
  console.log(\`User's USDT balance: \${ethers.formatUnits(userBalance, 6)} USDT\`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });`;
  
  // Write the withdraw script to a file
  fs.writeFileSync(path.resolve(__dirname, './withdraw-from-handler.js'), withdrawScript);
  console.log("\nCreated withdraw-from-handler.js script");
  
  // Create the execute proposal script
  const executeProposalScript = `const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  // User address and amount
  const userAddress = "${USER_ADDRESS}";
  const amountUsdt = "${AMOUNT_USDT}";
  const bscChainId = 56;
  
  // Connect to Bridge
  const bridge = await ethers.getContractAt("Bridge", studioDeploymentData.bridge);
  
  // Get the USDT resource ID
  const usdtResourceId = studioDeploymentData.resources.usdt.resourceID;
  
  // Convert amount to the correct units (USDT has 6 decimals on Studio)
  const amountInUnits = ethers.parseUnits(amountUsdt, 6);
  
  console.log(\`Executing proposal for \${amountUsdt} USDT to \${userAddress}...\`);
  
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
  
  console.log(\`Transaction hash: \${tx.hash}\`);
  await tx.wait();
  
  console.log(\`Successfully executed proposal for \${amountUsdt} USDT to \${userAddress}\`);
  
  // Get the USDT token contract
  const usdt = await ethers.getContractAt("IERC20", studioDeploymentData.resources.usdt.tokenAddress);
  
  // Check the user's balance
  const userBalance = await usdt.balanceOf(userAddress);
  console.log(\`User's USDT balance: \${ethers.formatUnits(userBalance, 6)} USDT\`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });`;
  
  // Write the execute proposal script to a file
  fs.writeFileSync(path.resolve(__dirname, './execute-proposal.js'), executeProposalScript);
  console.log("Created execute-proposal.js script");
  
  console.log("\nPlease choose one of the options above to process the failed transaction.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
