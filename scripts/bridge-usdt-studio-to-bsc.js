const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Amount to bridge
const AMOUNT_USDT = "1.0"; // 1 USDT

// Wallet address
const WALLET_ADDRESS = "0x846C234adc6D8E74353c0c355b0c2B6a1e46634f";

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  console.log(`Bridging ${AMOUNT_USDT} USDT from Studio to BSC...`);
  
  // Get Studio provider
  const studioProvider = ethers.provider;
  
  // Get USDT token contract on Studio
  const studioUsdtAddress = studioDeploymentData.resources.usdt.tokenAddress;
  const studioUsdt = await ethers.getContractAt("IERC20", studioUsdtAddress);
  
  // Get Bridge contract on Studio
  const studioBridge = await ethers.getContractAt("Bridge", studioDeploymentData.bridge);
  
  // Get ERC20Handler contract on Studio
  const studioErc20Handler = await ethers.getContractAt("ERC20HandlerFixed", studioDeploymentData.erc20HandlerFixed);
  
  // Get USDT resource ID
  const usdtResourceId = studioDeploymentData.resources.usdt.resourceID;
  
  // Convert amount to the correct units (USDT has 6 decimals on Studio)
  const amountInUnits = ethers.parseUnits(AMOUNT_USDT, 6);
  
  // Check USDT balance on Studio
  const studioUsdtBalance = await studioUsdt.balanceOf(WALLET_ADDRESS);
  console.log(`USDT balance on Studio before bridge: ${ethers.formatUnits(studioUsdtBalance, 6)} USDT`);
  
  if (studioUsdtBalance < amountInUnits) {
    console.error(`Not enough USDT on Studio. Need ${AMOUNT_USDT} USDT but only have ${ethers.formatUnits(studioUsdtBalance, 6)} USDT`);
    return;
  }
  
  // Check if USDT is approved for the ERC20Handler
  const allowance = await studioUsdt.allowance(WALLET_ADDRESS, studioDeploymentData.erc20HandlerFixed);
  console.log(`Current allowance: ${ethers.formatUnits(allowance, 6)} USDT`);
  
  if (allowance < amountInUnits) {
    console.log(`Approving ${AMOUNT_USDT} USDT for the ERC20Handler...`);
    const approveTx = await studioUsdt.approve(studioDeploymentData.erc20HandlerFixed, amountInUnits);
    console.log(`Approval transaction hash: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`Approval confirmed`);
  } else {
    console.log(`Already approved enough USDT for the ERC20Handler`);
  }
  
  // Get BSC chain ID
  const bscChainId = 56;
  
  // Encode the deposit data
  const depositData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address"],
    [amountInUnits, WALLET_ADDRESS]
  );
  
  // Calculate the fee
  const fee = await studioErc20Handler.calculateFee(
    usdtResourceId,
    WALLET_ADDRESS,
    bscChainId,
    depositData
  );
  
  console.log(`Fee: ${ethers.formatUnits(fee[1], 6)} USDT`);
  
  // Deposit USDT to the bridge
  console.log(`Depositing ${AMOUNT_USDT} USDT to the bridge...`);
  const depositTx = await studioBridge.deposit(
    bscChainId,
    usdtResourceId,
    depositData
  );
  
  console.log(`Deposit transaction hash: ${depositTx.hash}`);
  await depositTx.wait();
  
  console.log(`Deposit confirmed. The relayer will process this transaction and bridge the USDT to BSC.`);
  console.log(`Please wait a few minutes and then check your balance on BSC.`);
  
  // Check USDT balance on Studio after deposit
  const studioUsdtBalanceAfter = await studioUsdt.balanceOf(WALLET_ADDRESS);
  console.log(`USDT balance on Studio after bridge: ${ethers.formatUnits(studioUsdtBalanceAfter, 6)} USDT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
