const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Amount to bridge
const AMOUNT_USDT = "1.0"; // 1 USDT

// Wallet address
const WALLET_ADDRESS = "0x846C234adc6D8E74353c0c355b0c2B6a1e46634f";

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log(`Bridging ${AMOUNT_USDT} USDT from BSC to Studio...`);
  
  // Get BSC provider
  const bscProvider = ethers.provider;
  
  // Get USDT token contract on BSC
  const bscUsdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  const bscUsdt = await ethers.getContractAt("IERC20", bscUsdtAddress);
  
  // Get Bridge contract on BSC
  const bscBridge = await ethers.getContractAt("Bridge", bscDeploymentData.bridge);
  
  // Get ERC20Handler contract on BSC
  const bscErc20Handler = await ethers.getContractAt("ERC20HandlerFixed", bscDeploymentData.erc20HandlerFixed);
  
  // Get USDT resource ID
  const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
  
  // Convert amount to the correct units (USDT has 18 decimals on BSC)
  const amountInUnits = ethers.parseUnits(AMOUNT_USDT, 18);
  
  // Check USDT balance on BSC
  const bscUsdtBalance = await bscUsdt.balanceOf(WALLET_ADDRESS);
  console.log(`USDT balance on BSC before bridge: ${ethers.formatUnits(bscUsdtBalance, 18)} USDT`);
  
  if (bscUsdtBalance < amountInUnits) {
    console.error(`Not enough USDT on BSC. Need ${AMOUNT_USDT} USDT but only have ${ethers.formatUnits(bscUsdtBalance, 18)} USDT`);
    return;
  }
  
  // Check if USDT is approved for the ERC20Handler
  const allowance = await bscUsdt.allowance(WALLET_ADDRESS, bscDeploymentData.erc20HandlerFixed);
  console.log(`Current allowance: ${ethers.formatUnits(allowance, 18)} USDT`);
  
  if (allowance < amountInUnits) {
    console.log(`Approving ${AMOUNT_USDT} USDT for the ERC20Handler...`);
    const approveTx = await bscUsdt.approve(bscDeploymentData.erc20HandlerFixed, amountInUnits);
    console.log(`Approval transaction hash: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`Approval confirmed`);
  } else {
    console.log(`Already approved enough USDT for the ERC20Handler`);
  }
  
  // Get Studio chain ID
  const studioChainId = 240241;
  
  // Encode the deposit data
  const depositData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address"],
    [amountInUnits, WALLET_ADDRESS]
  );
  
  // Calculate the fee
  const fee = await bscErc20Handler.calculateFee(
    usdtResourceId,
    WALLET_ADDRESS,
    studioChainId,
    depositData
  );
  
  console.log(`Fee: ${ethers.formatUnits(fee[1], 18)} USDT`);
  
  // Deposit USDT to the bridge
  console.log(`Depositing ${AMOUNT_USDT} USDT to the bridge...`);
  const depositTx = await bscBridge.deposit(
    studioChainId,
    usdtResourceId,
    depositData
  );
  
  console.log(`Deposit transaction hash: ${depositTx.hash}`);
  await depositTx.wait();
  
  console.log(`Deposit confirmed. The relayer will process this transaction and bridge the USDT to Studio.`);
  console.log(`Please wait a few minutes and then check your balance on Studio.`);
  
  // Check USDT balance on BSC after deposit
  const bscUsdtBalanceAfter = await bscUsdt.balanceOf(WALLET_ADDRESS);
  console.log(`USDT balance on BSC after bridge: ${ethers.formatUnits(bscUsdtBalanceAfter, 18)} USDT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
