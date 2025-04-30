const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log("Checking bridge fee configuration...");
  
  // Check Studio fees
  console.log("\n=== Studio Chain Fees ===");
  await checkFees(studioDeploymentData, "Studio");
  
  // For BSC, we need to create a separate script since we can't connect to both networks in one script
  console.log("\n=== BSC Chain Fees ===");
  console.log("To check BSC fees, run the following command:");
  console.log("npx hardhat run scripts/check-bsc-fees.js --network bsc");
  
  // Create the BSC fee check script
  const bscFeeScript = `const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  console.log("\\n=== BSC Chain Fees ===");
  
  // Get BSC ERC20Handler
  const bscErc20Handler = await ethers.getContractAt("ERC20HandlerFixed", bscDeploymentData.erc20HandlerFixed);
  
  // Get USDT resource ID
  const usdtResourceId = bscDeploymentData.resources.usdt.resourceID;
  
  // Check fee percentage
  const feePercentage = await bscErc20Handler._feePercentage();
  console.log(\`Fee percentage: \${feePercentage} (100 = 1%)\`);
  console.log(\`Fee percentage in percent: \${feePercentage / 100}%\`);
  
  // Check chain fee multiplier for Studio chain
  const studioChainId = 240241;
  const chainFeeMultiplier = await bscErc20Handler.chainFeeMultipliers(studioChainId);
  console.log(\`Chain fee multiplier for Studio chain: \${chainFeeMultiplier} (1000 = 1x)\`);
  console.log(\`Chain fee multiplier in decimal: \${chainFeeMultiplier / 1000}x\`);
  
  // Check resource fee multiplier for USDT
  const resourceFeeMultiplier = await bscErc20Handler.resourceFeeMultipliers(usdtResourceId);
  console.log(\`Resource fee multiplier for USDT: \${resourceFeeMultiplier} (1000 = 1x)\`);
  console.log(\`Resource fee multiplier in decimal: \${resourceFeeMultiplier / 1000}x\`);
  
  // Check individual fee multiplier for Studio chain and USDT
  const individualFeeMultiplier = await bscErc20Handler.individualFeeMultipliers(studioChainId, usdtResourceId);
  console.log(\`Individual fee multiplier for Studio chain and USDT: \${individualFeeMultiplier} (1000 = 1x)\`);
  console.log(\`Individual fee multiplier in decimal: \${individualFeeMultiplier / 1000}x\`);
  
  // Calculate effective fee percentage
  let effectiveFeePercentage = feePercentage / 100; // Convert to percentage
  
  if (individualFeeMultiplier > 0) {
    // If individual fee multiplier is set, use it
    effectiveFeePercentage = (effectiveFeePercentage * individualFeeMultiplier) / 1000;
  } else {
    // Otherwise, apply chain and resource multipliers if they are set
    if (chainFeeMultiplier > 0) {
      effectiveFeePercentage = (effectiveFeePercentage * chainFeeMultiplier) / 1000;
    }
    if (resourceFeeMultiplier > 0) {
      effectiveFeePercentage = (effectiveFeePercentage * resourceFeeMultiplier) / 1000;
    }
  }
  
  console.log(\`\\nEffective fee percentage: \${effectiveFeePercentage}%\`);
  
  // Check if the fee is 3%
  if (Math.abs(effectiveFeePercentage - 3) < 0.1) {
    console.log(\`✅ Fee is approximately 3%\`);
  } else {
    console.log(\`❌ Fee is not 3% (it's \${effectiveFeePercentage}%)\`);
    
    // Calculate what values would make the fee 3%
    console.log(\`\\nTo set the fee to 3%, you can use one of the following configurations:\`);
    
    // Option 1: Set fee percentage to 300 (3%)
    console.log(\`Option 1: Set fee percentage to 300 (3%) and reset multipliers to default (1000)\`);
    console.log(\`Run: npx hardhat run scripts/update-bridge-fee.js --network bsc -- --feePercentage 300\`);
    
    // Option 2: Keep fee percentage and adjust multipliers
    if (feePercentage > 0) {
      const neededMultiplier = (3 * 100 * 1000) / feePercentage;
      console.log(\`Option 2: Keep fee percentage at \${feePercentage} and set individual multiplier to \${Math.round(neededMultiplier)}\`);
      console.log(\`Run: npx hardhat run scripts/update-bridge-fee.js --network bsc -- --individualMultiplier \${Math.round(neededMultiplier)} --destChainId \${studioChainId} --resourceId \${usdtResourceId}\`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });`;
  
  // Write the BSC fee check script to a file
  fs.writeFileSync(path.resolve(__dirname, './check-bsc-fees.js'), bscFeeScript);
  console.log("\nCreated check-bsc-fees.js script");
}

async function checkFees(deploymentData, chainName) {
  // Get Studio provider
  const studioRpcUrl = "https://mainnet.studio-blockchain.com";
  const provider = new ethers.JsonRpcProvider(studioRpcUrl);
  
  // ERC20Handler ABI (minimal for fee functions)
  const erc20HandlerAbi = [
    "function _feePercentage() view returns (uint256)",
    "function chainFeeMultipliers(uint256) view returns (uint256)",
    "function resourceFeeMultipliers(bytes32) view returns (uint256)",
    "function individualFeeMultipliers(uint256, bytes32) view returns (uint256)"
  ];
  
  // Get ERC20Handler
  const erc20Handler = new ethers.Contract(
    deploymentData.erc20HandlerFixed,
    erc20HandlerAbi,
    provider
  );
  
  // Get USDT resource ID
  const usdtResourceId = deploymentData.resources.usdt.resourceID;
  
  // Check fee percentage
  const feePercentage = await erc20Handler._feePercentage();
  const feePercentageNumber = Number(feePercentage);
  console.log(`Fee percentage: ${feePercentageNumber} (100 = 1%)`);
  console.log(`Fee percentage in percent: ${feePercentageNumber / 100}%`);
  
  // Check chain fee multiplier for the other chain
  const otherChainId = chainName === "Studio" ? 56 : 240241; // BSC = 56, Studio = 240241
  const otherChainName = chainName === "Studio" ? "BSC" : "Studio";
  const chainFeeMultiplier = await erc20Handler.chainFeeMultipliers(otherChainId);
  const chainFeeMultiplierNumber = Number(chainFeeMultiplier);
  console.log(`Chain fee multiplier for ${otherChainName} chain: ${chainFeeMultiplierNumber} (1000 = 1x)`);
  console.log(`Chain fee multiplier in decimal: ${chainFeeMultiplierNumber / 1000}x`);
  
  // Check resource fee multiplier for USDT
  const resourceFeeMultiplier = await erc20Handler.resourceFeeMultipliers(usdtResourceId);
  const resourceFeeMultiplierNumber = Number(resourceFeeMultiplier);
  console.log(`Resource fee multiplier for USDT: ${resourceFeeMultiplierNumber} (1000 = 1x)`);
  console.log(`Resource fee multiplier in decimal: ${resourceFeeMultiplierNumber / 1000}x`);
  
  // Check individual fee multiplier for the other chain and USDT
  const individualFeeMultiplier = await erc20Handler.individualFeeMultipliers(otherChainId, usdtResourceId);
  const individualFeeMultiplierNumber = Number(individualFeeMultiplier);
  console.log(`Individual fee multiplier for ${otherChainName} chain and USDT: ${individualFeeMultiplierNumber} (1000 = 1x)`);
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
    console.log(`Run: npx hardhat run scripts/update-bridge-fee.js -- --feePercentage 300`);
    
    // Option 2: Keep fee percentage and adjust multipliers
    if (feePercentage > 0) {
      const neededMultiplier = (3 * 100 * 1000) / feePercentage;
      console.log(`Option 2: Keep fee percentage at ${feePercentage} and set individual multiplier to ${Math.round(neededMultiplier)}`);
      console.log(`Run: npx hardhat run scripts/update-bridge-fee.js -- --individualMultiplier ${Math.round(neededMultiplier)} --destChainId ${otherChainId} --resourceId ${usdtResourceId}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
