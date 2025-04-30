const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration
const STUDIO_CHAIN_ID = 240241;
const USDT_ADDRESS = '0xFcCC20bf4f0829e121bC99FF2222456Ad4465A1E'; // Keep the same USDT address

// Resource IDs (keep the same to maintain compatibility)
const USDT_RESOURCE_ID = '0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0';
const NATIVE_RESOURCE_ID = '0xbefae8b7ff926e5ec4428d291aa6cb21f134a3e9f02ace30ff61c382a104c57f';
const BNB_RESOURCE_ID = '0x3ed03c38e59dc60c7b69c2a4bf68f9214acd953252b5a90e8f5f59583e9bc3ae';

// Fee configuration
const FEE_PERCENTAGE = 100; // 1%

// Deployment parameters
const RELAYER_ADDRESS = '0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7';
const RELAYER_THRESHOLD = 1;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy RateLimiter
  console.log("Deploying RateLimiter...");
  const RateLimiter = await ethers.getContractFactory("RateLimiter");
  const rateLimiter = await RateLimiter.deploy();
  await rateLimiter.waitForDeployment();
  const rateLimiterAddress = await rateLimiter.getAddress();
  console.log("RateLimiter deployed to:", rateLimiterAddress);

  // Deploy Bridge
  console.log("Deploying Bridge...");
  const Bridge = await ethers.getContractFactory("Bridge");
  const bridge = await Bridge.deploy(
    STUDIO_CHAIN_ID,
    [RELAYER_ADDRESS],
    RELAYER_THRESHOLD
  );
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("Bridge deployed to:", bridgeAddress);

  // Deploy ERC20HandlerFixed
  console.log("Deploying ERC20HandlerFixed...");
  const ERC20HandlerFixed = await ethers.getContractFactory("ERC20HandlerFixed");
  const erc20HandlerFixed = await ERC20HandlerFixed.deploy(
    bridgeAddress,
    FEE_PERCENTAGE
  );
  await erc20HandlerFixed.waitForDeployment();
  const erc20HandlerFixedAddress = await erc20HandlerFixed.getAddress();
  console.log("ERC20HandlerFixed deployed to:", erc20HandlerFixedAddress);

  // Deploy NativeHandler
  console.log("Deploying NativeHandler...");
  const NativeHandler = await ethers.getContractFactory("NativeHandler");
  const nativeHandler = await NativeHandler.deploy(
    bridgeAddress,
    FEE_PERCENTAGE
  );
  await nativeHandler.waitForDeployment();
  const nativeHandlerAddress = await nativeHandler.getAddress();
  console.log("NativeHandler deployed to:", nativeHandlerAddress);

  // Configure contracts
  console.log("Configuring contracts...");

  // Configure ERC20HandlerFixed
  console.log("Configuring ERC20HandlerFixed...");
  await erc20HandlerFixed.setThisChainID(STUDIO_CHAIN_ID);
  console.log(`Set chain ID to ${STUDIO_CHAIN_ID} for ERC20HandlerFixed`);
  
  await erc20HandlerFixed.updateRateLimiter(rateLimiterAddress);
  console.log(`Set rate limiter for ERC20HandlerFixed`);
  
  await erc20HandlerFixed.setResource(USDT_RESOURCE_ID, USDT_ADDRESS);
  console.log(`Set resource for USDT in ERC20HandlerFixed`);
  
  // Skip auto-detecting decimals for now as it's causing issues
  // await erc20HandlerFixed.autoDetectDecimals(USDT_RESOURCE_ID);
  // console.log(`Auto-detected decimals for USDT`);
  
  // Set decimals manually instead
  await erc20HandlerFixed.setTokenDecimals(USDT_RESOURCE_ID, STUDIO_CHAIN_ID, 18);
  console.log(`Set decimals for USDT to 18`);

  // Configure NativeHandler
  console.log("Configuring NativeHandler...");
  await nativeHandler.setThisChainID(STUDIO_CHAIN_ID);
  console.log(`Set chain ID to ${STUDIO_CHAIN_ID} for NativeHandler`);
  
  await nativeHandler.updateRateLimiter(rateLimiterAddress);
  console.log(`Set rate limiter for NativeHandler`);

  // Configure Bridge
  console.log("Configuring Bridge...");
  await bridge.setResource(USDT_RESOURCE_ID, erc20HandlerFixedAddress);
  console.log(`Set USDT resource in Bridge`);
  
  await bridge.setResource(NATIVE_RESOURCE_ID, nativeHandlerAddress);
  console.log(`Set native resource in Bridge`);
  
  await bridge.setResource(BNB_RESOURCE_ID, erc20HandlerFixedAddress);
  console.log(`Set BNB resource in Bridge`);

  // Update deployment file
  console.log("Updating deployment file...");
  const deploymentData = {
    network: 'studio',
    chainId: STUDIO_CHAIN_ID,
    rateLimiter: rateLimiterAddress,
    bridge: bridgeAddress,
    erc20Handler: '0xEedf1D452489cc1044423fFd847c33E26E7C55A2', // Keep the old address for reference
    erc20HandlerFixed: erc20HandlerFixedAddress,
    nativeHandler: nativeHandlerAddress,
    resources: {
      usdt: {
        resourceID: USDT_RESOURCE_ID,
        tokenAddress: USDT_ADDRESS
      },
      native: {
        resourceID: NATIVE_RESOURCE_ID,
        tokenAddress: '0x0000000000000000000000000000000000000000'
      },
      bnb: {
        resourceID: BNB_RESOURCE_ID
      }
    },
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../studio-deployment.json'),
    JSON.stringify(deploymentData, null, 2)
  );
  console.log("Deployment file updated");

  // Print summary
  console.log("\nDeployment Summary:");
  console.log(`RateLimiter: ${rateLimiterAddress}`);
  console.log(`Bridge: ${bridgeAddress}`);
  console.log(`ERC20HandlerFixed: ${erc20HandlerFixedAddress}`);
  console.log(`NativeHandler: ${nativeHandlerAddress}`);
  console.log(`USDT Address: ${USDT_ADDRESS}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
