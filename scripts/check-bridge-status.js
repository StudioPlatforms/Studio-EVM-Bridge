const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Get the network name
  const network = hre.network.name;
  console.log(`Checking bridge status on ${network}...`);

  // Load deployment info based on network
  const deploymentPath = path.resolve(__dirname, `../${network}-deployment.json`);
  let deploymentData;
  
  try {
    deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  } catch (error) {
    console.error(`Error loading deployment data: ${error.message}`);
    console.error(`Make sure ${deploymentPath} exists and is valid JSON.`);
    process.exit(1);
  }

  // Get contract addresses
  const bridgeAddress = deploymentData.bridge;
  const erc20HandlerAddress = deploymentData.erc20HandlerFixed;
  const nativeHandlerAddress = deploymentData.nativeHandler;
  const rateLimiterAddress = deploymentData.rateLimiter;

  console.log(`\n=== Bridge Contracts ===`);
  console.log(`Bridge: ${bridgeAddress}`);
  console.log(`ERC20Handler: ${erc20HandlerAddress}`);
  console.log(`NativeHandler: ${nativeHandlerAddress}`);
  console.log(`RateLimiter: ${rateLimiterAddress}`);

  // Get contract instances
  const bridge = await ethers.getContractAt("Bridge", bridgeAddress);
  const erc20Handler = await ethers.getContractAt("ERC20HandlerFixed", erc20HandlerAddress);
  const nativeHandler = await ethers.getContractAt("NativeHandler", nativeHandlerAddress);
  
  // Check if RateLimiter exists
  let rateLimiter;
  if (rateLimiterAddress) {
    rateLimiter = await ethers.getContractAt("RateLimiter", rateLimiterAddress);
  }

  // Get bridge chain ID
  const chainID = await bridge._chainID();
  console.log(`\n=== Bridge Configuration ===`);
  console.log(`Chain ID: ${chainID}`);

  // Get bridge owner
  const owner = await bridge.owner();
  console.log(`Owner: ${owner}`);

  // Check if bridge is paused
  try {
    const paused = await bridge.paused();
    console.log(`Paused: ${paused}`);
  } catch (error) {
    console.log(`Paused: Error checking pause status`);
  }

  // Get relayer threshold
  try {
    const relayerThreshold = await bridge._relayerThreshold();
    console.log(`Relayer Threshold: ${relayerThreshold}`);
  } catch (error) {
    console.log(`Relayer Threshold: Error checking threshold`);
  }

  // Get fee percentage from ERC20Handler
  try {
    const feePercentage = await erc20Handler._feePercentage();
    console.log(`ERC20 Fee Percentage: ${feePercentage / 100}%`);
  } catch (error) {
    console.log(`ERC20 Fee Percentage: Error checking fee`);
  }

  // Get fee percentage from NativeHandler
  try {
    const nativeFeePercentage = await nativeHandler._feePercentage();
    console.log(`Native Fee Percentage: ${nativeFeePercentage / 100}%`);
  } catch (error) {
    console.log(`Native Fee Percentage: Error checking fee`);
  }

  // Check if the current signer is a relayer
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const isRelayer = await bridge.isRelayer(signerAddress);
  console.log(`\n=== Relayer Status ===`);
  console.log(`Current Signer: ${signerAddress}`);
  console.log(`Is Relayer: ${isRelayer}`);

  // Get supported tokens
  console.log(`\n=== Supported Tokens ===`);
  for (const [tokenSymbol, tokenData] of Object.entries(deploymentData.resources || {})) {
    console.log(`\n${tokenSymbol.toUpperCase()}:`);
    console.log(`  Resource ID: ${tokenData.resourceID}`);
    console.log(`  Token Address: ${tokenData.tokenAddress}`);

    // Check if the resource ID is set in the bridge
    try {
      const handlerAddress = await bridge._resourceIDToHandlerAddress(tokenData.resourceID);
      console.log(`  Handler Address: ${handlerAddress}`);
      console.log(`  Correctly Configured in Bridge: ${handlerAddress.toLowerCase() === erc20HandlerAddress.toLowerCase() || handlerAddress.toLowerCase() === nativeHandlerAddress.toLowerCase()}`);
    } catch (error) {
      console.log(`  Error checking resource ID in bridge`);
    }

    // Check token decimals if it's an ERC20 token
    if (tokenData.tokenAddress) {
      try {
        // Try to get the token contract
        const token = await ethers.getContractAt("IERC20", tokenData.tokenAddress);
        
        // Try to get the decimals
        try {
          const decimals = await token.decimals();
          console.log(`  Token Decimals: ${decimals}`);
        } catch (error) {
          console.log(`  Token Decimals: Error getting decimals`);
        }
        
        // Try to get the token balance in the handler
        try {
          const handlerBalance = await token.balanceOf(erc20HandlerAddress);
          console.log(`  Handler Balance: ${ethers.formatUnits(handlerBalance, await token.decimals())} ${tokenSymbol.toUpperCase()}`);
        } catch (error) {
          console.log(`  Handler Balance: Error getting balance`);
        }
      } catch (error) {
        console.log(`  Error getting token contract`);
      }
    }

    // Check rate limits if RateLimiter exists
    if (rateLimiter) {
      try {
        const rateLimit = await rateLimiter.getLimit(tokenData.resourceID);
        console.log(`  Rate Limit: ${rateLimit.limit}`);
        console.log(`  Rate Period: ${rateLimit.period} seconds`);
        console.log(`  Current Total: ${rateLimit.currentTotal}`);
        console.log(`  Period End: ${new Date(Number(rateLimit.periodEnd) * 1000).toISOString()}`);
      } catch (error) {
        console.log(`  Rate Limit: Error checking rate limit`);
      }
    }
  }

  console.log(`\n=== Bridge Status Check Complete ===`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
