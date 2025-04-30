const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  console.log("Verifying Studio contracts...");
  
  // Get Studio provider
  const studioRpcUrl = "https://mainnet.studio-blockchain.com";
  const provider = new ethers.JsonRpcProvider(studioRpcUrl);
  
  // Check Bridge contract
  await checkContract(provider, "Bridge", studioDeploymentData.bridge);
  
  // Check ERC20Handler contract
  await checkContract(provider, "ERC20Handler", studioDeploymentData.erc20Handler);
  
  // Check ERC20HandlerFixed contract
  await checkContract(provider, "ERC20HandlerFixed", studioDeploymentData.erc20HandlerFixed);
  
  // Check NativeHandler contract
  await checkContract(provider, "NativeHandler", studioDeploymentData.nativeHandler);
  
  // Check RateLimiter contract
  await checkContract(provider, "RateLimiter", studioDeploymentData.rateLimiter);
  
  // Check USDT contract
  const usdtAddress = studioDeploymentData.resources.usdt.tokenAddress;
  await checkContract(provider, "USDT", usdtAddress);
  
  console.log("\nChecking USDT token details...");
  
  // USDT ABI (minimal for token details)
  const usdtAbi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)"
  ];
  
  try {
    const usdt = new ethers.Contract(usdtAddress, usdtAbi, provider);
    
    // Get token details
    const name = await usdt.name();
    const symbol = await usdt.symbol();
    const decimals = await usdt.decimals();
    const totalSupply = await usdt.totalSupply();
    
    console.log(`USDT Name: ${name}`);
    console.log(`USDT Symbol: ${symbol}`);
    console.log(`USDT Decimals: ${decimals}`);
    console.log(`USDT Total Supply: ${ethers.formatUnits(totalSupply, decimals)}`);
    
    // Check handler balance
    const handlerBalance = await usdt.balanceOf(studioDeploymentData.erc20HandlerFixed);
    console.log(`\nUSDT Balance in ERC20HandlerFixed: ${ethers.formatUnits(handlerBalance, decimals)}`);
    
    if (Number(handlerBalance) > 0) {
      console.log(`✅ ERC20HandlerFixed has USDT tokens`);
    } else {
      console.log(`❌ ERC20HandlerFixed has no USDT tokens`);
    }
  } catch (error) {
    console.log(`❌ Error checking USDT details: ${error.message}`);
  }
}

async function checkContract(provider, name, address) {
  console.log(`\nChecking ${name} contract at ${address}...`);
  
  try {
    // Check if the address has code
    const code = await provider.getCode(address);
    
    if (code !== "0x") {
      console.log(`✅ ${name} contract exists at ${address}`);
      
      // Get contract balance
      const balance = await provider.getBalance(address);
      console.log(`${name} contract balance: ${ethers.formatEther(balance)} STO`);
      
      return true;
    } else {
      console.log(`❌ ${name} contract does not exist at ${address}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error checking ${name} contract: ${error.message}`);
    return false;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
