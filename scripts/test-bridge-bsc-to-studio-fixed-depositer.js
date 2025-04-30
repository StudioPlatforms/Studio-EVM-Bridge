const { ethers } = require("ethers");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

// Amount to bridge (0.5 USDT)
const AMOUNT_TO_BRIDGE = ethers.parseUnits("0.5", 18); // BSC USDT has 18 decimals

// BSC RPC URL
const BSC_RPC_URL = "https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c";

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(`Creating test transaction to bridge 0.5 USDT from BSC to Studio with fixed depositer...`);
  
  // Get provider
  const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
  
  // Get signer from private key in .env file
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("PRIVATE_KEY not found in .env file");
    return;
  }
  const signer = new ethers.Wallet(privateKey, provider);
  console.log(`Using signer: ${signer.address}`);
  
  // Get USDT token contract on BSC
  const bscUsdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  console.log(`BSC USDT address: ${bscUsdtAddress}`);
  
  const bscUsdt = new ethers.Contract(
    bscUsdtAddress,
    ["function balanceOf(address) view returns (uint256)", "function approve(address, uint256) returns (bool)"],
    signer
  );
  
  // Check USDT balance
  const usdtBalance = await bscUsdt.balanceOf(signer.address);
  console.log(`USDT balance: ${ethers.formatUnits(usdtBalance, 18)} USDT`);
  
  if (usdtBalance < AMOUNT_TO_BRIDGE) {
    console.error(`Insufficient USDT balance. Need at least 0.5 USDT.`);
    return;
  }
  
  // Get bridge contract
  const bridgeAddress = bscDeploymentData.bridge;
  console.log(`BSC bridge address: ${bridgeAddress}`);
  
  // Get handler contract - use regular ERC20Handler instead of ERC20HandlerFixed
  const handlerAddress = bscDeploymentData.erc20Handler;
  console.log(`BSC ERC20Handler address: ${handlerAddress}`);
  
  // Get resource ID
  const resourceID = bscDeploymentData.resources.usdt.resourceID;
  console.log(`USDT resource ID: ${resourceID}`);
  
  // Reset allowance to 0 first (some tokens require this)
  console.log(`Resetting allowance to 0 first...`);
  const resetTx = await bscUsdt.approve(handlerAddress, 0);
  console.log(`Reset transaction hash: ${resetTx.hash}`);
  await resetTx.wait();
  console.log(`Reset confirmed`);
  
  // Approve handler to spend USDT
  console.log(`Approving handler to spend 0.5 USDT...`);
  const approveTx = await bscUsdt.approve(handlerAddress, AMOUNT_TO_BRIDGE);
  console.log(`Approval transaction submitted: ${approveTx.hash}`);
  await approveTx.wait();
  console.log(`Approval transaction confirmed`);
  
  // Get bridge contract
  const bridge = new ethers.Contract(
    bridgeAddress,
    ["function deposit(uint256, bytes32, bytes) returns (bool)"],
    signer
  );
  
  // Destination chain ID for Studio
  const destinationChainID = 240241;
  
  // Encode the deposit data - explicitly include the depositer address
  const depositData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address"],
    [AMOUNT_TO_BRIDGE, signer.address]
  );
  
  console.log(`Depositing 0.5 USDT to bridge...`);
  console.log(`Destination chain ID: ${destinationChainID}`);
  console.log(`Resource ID: ${resourceID}`);
  console.log(`Depositer: ${signer.address}`);
  
  // Make deposit
  const depositTx = await bridge.deposit(destinationChainID, resourceID, depositData);
  console.log(`\nDeposit transaction submitted: ${depositTx.hash}`);
  console.log(`\nPlease monitor the relayer logs to see if this transaction is picked up.`);
  console.log(`\nAfter the transaction is confirmed, run the following command to check the deposit event:`);
  console.log(`node scripts/check-bsc-deposit-events.js --tx ${depositTx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
