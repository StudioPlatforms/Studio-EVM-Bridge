const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Bridge owner private key
  const privateKey = "86d120d242ea32fa4ac72d9b2147ba3cd871158ed5f8353e98838bc13d24fcee";
  
  // BSC RPC URL
  const bscRpcUrl = "https://bsc-dataseed.binance.org/";
  
  // Create provider and wallet
  const provider = new ethers.JsonRpcProvider(bscRpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`Using wallet address: ${wallet.address}`);
  
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  // Get the bridge and USDT addresses from the deployment file
  const bridgeAddress = bscDeploymentData.bridge;
  const usdtAddress = bscDeploymentData.resources.usdt.tokenAddress;
  
  console.log(`Bridge address: ${bridgeAddress}`);
  console.log(`USDT address: ${usdtAddress}`);
  
  // Connect to the bridge contract
  const bridgeAbi = [
    "function adminWithdraw(address token, address recipient, uint256 amount) external",
    "function owner() view returns (address)"
  ];
  const bridge = new ethers.Contract(bridgeAddress, bridgeAbi, wallet);
  
  // Connect to the USDT token contract
  const erc20Abi = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];
  const usdt = new ethers.Contract(usdtAddress, erc20Abi, provider);
  
  // Check if the wallet is the owner of the bridge
  const bridgeOwner = await bridge.owner();
  if (bridgeOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(`Error: The wallet (${wallet.address}) is not the owner of the bridge (${bridgeOwner})`);
    console.error("You must use the correct owner's private key");
    process.exit(1);
  } else {
    console.log(`✅ Confirmed wallet is the bridge owner`);
  }
  
  try {
    // Get the USDT balance of the bridge
    const bridgeBalance = await usdt.balanceOf(bridgeAddress);
    const decimals = await usdt.decimals();
    const bridgeBalanceFormatted = ethers.formatUnits(bridgeBalance, decimals);
    
    console.log(`Bridge USDT balance: ${bridgeBalanceFormatted} USDT`);
    
    if (bridgeBalance == 0n) {
      console.log("The bridge has no USDT balance to withdraw");
      process.exit(0);
    }
    
    console.log(`Withdrawing ${bridgeBalanceFormatted} USDT from bridge to ${wallet.address}...`);
    
    // Call the adminWithdraw function to withdraw the USDT
    const tx = await bridge.adminWithdraw(usdtAddress, wallet.address, bridgeBalance);
    
    console.log(`Transaction hash: ${tx.hash}`);
    console.log("Waiting for transaction confirmation...");
    
    const receipt = await tx.wait();
    
    console.log(`✅ Successfully withdrawn ${bridgeBalanceFormatted} USDT to ${wallet.address}`);
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Check the owner's balance
    const ownerBalance = await usdt.balanceOf(wallet.address);
    console.log(`Owner's USDT balance: ${ethers.formatUnits(ownerBalance, decimals)} USDT`);
  } catch (error) {
    console.error("❌ Error during withdrawal:");
    console.error(error.message);
    
    if (error.data) {
      console.error("Contract error data:", error.data);
    }
    
    process.exit(1);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
