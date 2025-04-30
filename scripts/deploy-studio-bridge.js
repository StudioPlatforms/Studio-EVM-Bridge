const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration for the bridge deployment
// In a real script, these would be provided as command-line arguments or environment variables
const INITIAL_RELAYERS = ["0x0000000000000000000000000000000000000000"]; // Replace with actual relayer addresses
const RELAYER_THRESHOLD = 1; // Number of relayers required to execute a proposal
const FEE_PERCENTAGE = 300; // 3.00% fee (300 = 3.00%)

async function main() {
  // Get the network name and chain ID
  const network = hre.network.name;
  const chainId = hre.network.config.chainId;
  
  console.log(`Deploying bridge contracts on ${network} (chainId: ${chainId})...`);

  // Create deployment file path
  const deploymentPath = path.resolve(__dirname, `../${network}-deployment.json`);
  
  // Load existing deployment data if it exists
  let deploymentData = {};
  try {
    if (fs.existsSync(deploymentPath)) {
      deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      console.log(`Loaded existing deployment data from ${deploymentPath}`);
    }
  } catch (error) {
    console.log(`No existing deployment data found or error loading it: ${error.message}`);
  }

  // Initialize deployment data
  deploymentData.network = network;
  deploymentData.chainId = chainId;
  deploymentData.updatedAt = new Date().toISOString();

  // Deploy RateLimiter contract
  console.log(`Deploying RateLimiter...`);
  const RateLimiter = await ethers.getContractFactory("RateLimiter");
  const rateLimiter = await RateLimiter.deploy();
  await rateLimiter.waitForDeployment();
  const rateLimiterAddress = await rateLimiter.getAddress();
  console.log(`RateLimiter deployed to: ${rateLimiterAddress}`);
  deploymentData.rateLimiter = rateLimiterAddress;

  // Deploy Bridge contract
  console.log(`Deploying Bridge with chainId ${chainId}, relayers ${INITIAL_RELAYERS}, threshold ${RELAYER_THRESHOLD}...`);
  const Bridge = await ethers.getContractFactory("Bridge");
  const bridge = await Bridge.deploy(chainId, INITIAL_RELAYERS, RELAYER_THRESHOLD);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log(`Bridge deployed to: ${bridgeAddress}`);
  deploymentData.bridge = bridgeAddress;

  // Deploy ERC20HandlerFixed contract
  console.log(`Deploying ERC20HandlerFixed with bridge ${bridgeAddress}, fee ${FEE_PERCENTAGE}...`);
  const ERC20HandlerFixed = await ethers.getContractFactory("ERC20HandlerFixed");
  const erc20HandlerFixed = await ERC20HandlerFixed.deploy(bridgeAddress, FEE_PERCENTAGE);
  await erc20HandlerFixed.waitForDeployment();
  const erc20HandlerFixedAddress = await erc20HandlerFixed.getAddress();
  console.log(`ERC20HandlerFixed deployed to: ${erc20HandlerFixedAddress}`);
  deploymentData.erc20HandlerFixed = erc20HandlerFixedAddress;

  // Set the chain ID in the ERC20HandlerFixed contract
  console.log(`Setting chain ID ${chainId} in ERC20HandlerFixed...`);
  const setChainIdTx = await erc20HandlerFixed.setThisChainID(chainId);
  await setChainIdTx.wait();
  console.log(`Chain ID set in ERC20HandlerFixed`);

  // Set the rate limiter in the ERC20HandlerFixed contract
  console.log(`Setting rate limiter ${rateLimiterAddress} in ERC20HandlerFixed...`);
  const setRateLimiterTx = await erc20HandlerFixed.updateRateLimiter(rateLimiterAddress);
  await setRateLimiterTx.wait();
  console.log(`Rate limiter set in ERC20HandlerFixed`);

  // Deploy NativeHandler contract
  console.log(`Deploying NativeHandler with bridge ${bridgeAddress}, fee ${FEE_PERCENTAGE}...`);
  const NativeHandler = await ethers.getContractFactory("NativeHandler");
  const nativeHandler = await NativeHandler.deploy(bridgeAddress, FEE_PERCENTAGE);
  await nativeHandler.waitForDeployment();
  const nativeHandlerAddress = await nativeHandler.getAddress();
  console.log(`NativeHandler deployed to: ${nativeHandlerAddress}`);
  deploymentData.nativeHandler = nativeHandlerAddress;

  // Set the chain ID in the NativeHandler contract
  console.log(`Setting chain ID ${chainId} in NativeHandler...`);
  const setNativeChainIdTx = await nativeHandler.setThisChainID(chainId);
  await setNativeChainIdTx.wait();
  console.log(`Chain ID set in NativeHandler`);

  // Set the rate limiter in the NativeHandler contract
  console.log(`Setting rate limiter ${rateLimiterAddress} in NativeHandler...`);
  const setNativeRateLimiterTx = await nativeHandler.updateRateLimiter(rateLimiterAddress);
  await setNativeRateLimiterTx.wait();
  console.log(`Rate limiter set in NativeHandler`);

  // Initialize resources object if it doesn't exist
  deploymentData.resources = deploymentData.resources || {};

  // Add native token resource
  const nativeResourceId = "0xbefae8b7ff926e5ec4428d291aa6cb21f134a3e9f02ace30ff61c382a104c57f";
  deploymentData.resources.native = {
    resourceID: nativeResourceId,
    tokenAddress: "0x0000000000000000000000000000000000000000"
  };

  // Save deployment data to file
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentData, null, 2), 'utf8');
  console.log(`Deployment data saved to ${deploymentPath}`);

  console.log(`\n=== Bridge Deployment Complete ===`);
  console.log(`Bridge: ${bridgeAddress}`);
  console.log(`ERC20HandlerFixed: ${erc20HandlerFixedAddress}`);
  console.log(`NativeHandler: ${nativeHandlerAddress}`);
  console.log(`RateLimiter: ${rateLimiterAddress}`);
  console.log(`\nNext steps:`);
  console.log(`1. Register relayers on the bridge`);
  console.log(`2. Add token resources to the bridge`);
  console.log(`3. Verify contracts on the block explorer`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
