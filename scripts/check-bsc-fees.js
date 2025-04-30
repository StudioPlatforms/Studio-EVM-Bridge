const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log("\n=== BSC Chain Fees ===");
  
  // Get BSC provider
  const bscRpcUrl = "https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c";
  const provider = new ethers.JsonRpcProvider(bscRpcUrl);
  
  // ERC20Handler ABI (minimal for fee functions)
  const erc20HandlerAbi = [
    "function _feePercentage() view returns (uint256)",
    "function chainFeeMultipliers(uint256) view returns (uint256)",
    "function resourceFeeMultipliers(bytes32) view returns (uint256)",
    "function individualFeeMultipliers(uint256, bytes32) view returns (uint256)"
  ];
  
  // Get BSC ERC20Handler
  const bscErc20Handler = new ethers.Contract(
    bscDeploymentData.erc20HandlerFixed,
    erc20HandlerAbi,
    provider
  );
  
  // Get USDT resource ID
  const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
  
  // Check fee percentage
  const feePercentage = await bscErc20Handler._feePercentage();
  const feePercentageNumber = Number(feePercentage);
  console.log(`Fee percentage: ${feePercentageNumber} (100 = 1%)`);
  console.log(`Fee percentage in percent: ${feePercentageNumber / 100}%`);
  
  // Check chain fee multiplier for Studio chain
  const studioChainId = 240241;
  const chainFeeMultiplier = await bscErc20Handler.chainFeeMultipliers(studioChainId);
  const chainFeeMultiplierNumber = Number(chainFeeMultiplier);
  console.log(`Chain fee multiplier for Studio chain: ${chainFeeMultiplierNumber} (1000 = 1x)`);
  console.log(`Chain fee multiplier in decimal: ${chainFeeMultiplierNumber / 1000}x`);
  
  // Check resource fee multiplier for USDT
  const resourceFeeMultiplier = await bscErc20Handler.resourceFeeMultipliers(usdtResourceId);
  const resourceFeeMultiplierNumber = Number(resourceFeeMultiplier);
  console.log(`Resource fee multiplier for USDT: ${resourceFeeMultiplierNumber} (1000 = 1x)`);
  console.log(`Resource fee multiplier in decimal: ${resourceFeeMultiplierNumber / 1000}x`);
  
  // Check individual fee multiplier for Studio chain and USDT
  const individualFeeMultiplier = await bscErc20Handler.individualFeeMultipliers(studioChainId, usdtResourceId);
  const individualFeeMultiplierNumber = Number(individualFeeMultiplier);
  console.log(`Individual fee multiplier for Studio chain and USDT: ${individualFeeMultiplierNumber} (1000 = 1x)`);
  console.log(`Individual fee multiplier in decimal: ${individualFeeMultiplierNumber / 1000}x`);
  
  // Calculate effective fee percentage
  let effectiveFeePercentage = feePercentageNumber / 100; // Convert to percentage
  
  if (individualFeeMultiplierNumber > 0) {
    // If individual fee multiplier is set, use it
    effectiveFeePercentage = (effectiveFeePercentage * individualFeeMultiplierNumber) / 1000;
  } else {
    // Otherwise, apply chain and resource multipliers if they are set
    if (chainFeeMultiplierNumber > 0) {
      effectiveFeePercentage = (effectiveFeePercentage * chainFeeMultiplierNumber) / 1000;
    }
    if (resourceFeeMultiplierNumber > 0) {
      effectiveFeePercentage = (effectiveFeePercentage * resourceFeeMultiplierNumber) / 1000;
    }
  }
  
  console.log(`\nEffective fee percentage: ${effectiveFeePercentage}%`);
  
  // Check if the fee is 3%
  if (Math.abs(effectiveFeePercentage - 3) < 0.1) {
    console.log(`✅ Fee is approximately 3%`);
  } else {
    console.log(`❌ Fee is not 3% (it's ${effectiveFeePercentage}%)`);
    
    // Calculate what values would make the fee 3%
    console.log(`\nTo set the fee to 3%, you can use one of the following configurations:`);
    
    // Option 1: Set fee percentage to 300 (3%)
    console.log(`Option 1: Set fee percentage to 300 (3%) and reset multipliers to default (1000)`);
    console.log(`Run: npx hardhat run scripts/update-bridge-fee.js --network bsc -- --feePercentage 300`);
    
    // Option 2: Keep fee percentage and adjust multipliers
    if (feePercentage > 0) {
      const neededMultiplier = (3 * 100 * 1000) / feePercentage;
      console.log(`Option 2: Keep fee percentage at ${feePercentage} and set individual multiplier to ${Math.round(neededMultiplier)}`);
      console.log(`Run: npx hardhat run scripts/update-bridge-fee.js --network bsc -- --individualMultiplier ${Math.round(neededMultiplier)} --destChainId ${studioChainId} --resourceId ${usdtResourceId}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
