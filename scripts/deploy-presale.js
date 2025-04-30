const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration
const USDT_ADDRESS = '0xFcCC20bf4f0829e121bC99FF2222456Ad4465A1E'; // Same USDT address as in the bridge
const BASE_TOKEN_PRICE = 60000; // 0.06 USDT per STO token (6 decimals)
const MIN_PURCHASE_AMOUNT = 50000000; // $50 (6 decimals)
const TARGET_RAISE_AMOUNT = 1200000000000; // $1.2M (6 decimals)
const TOTAL_TOKENS_ALLOCATED = ethers.parseEther("20000000"); // 20M tokens (18 decimals)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy StudioPresale
  console.log("Deploying StudioPresale...");
  const StudioPresale = await ethers.getContractFactory("StudioPresale");
  const presale = await StudioPresale.deploy(
    USDT_ADDRESS,
    BASE_TOKEN_PRICE,
    MIN_PURCHASE_AMOUNT,
    TARGET_RAISE_AMOUNT,
    TOTAL_TOKENS_ALLOCATED
  );
  await presale.waitForDeployment();
  const presaleAddress = await presale.getAddress();
  console.log("StudioPresale deployed to:", presaleAddress);

  // Deploy STORecovery
  console.log("Deploying STORecovery...");
  const STORecovery = await ethers.getContractFactory("STORecovery");
  const recovery = await STORecovery.deploy();
  await recovery.waitForDeployment();
  const recoveryAddress = await recovery.getAddress();
  console.log("STORecovery deployed to:", recoveryAddress);

  // Save deployment info
  const deploymentData = {
    network: 'studio',
    presale: presaleAddress,
    recovery: recoveryAddress,
    usdt: USDT_ADDRESS,
    baseTokenPrice: BASE_TOKEN_PRICE,
    minPurchaseAmount: MIN_PURCHASE_AMOUNT,
    targetRaiseAmount: TARGET_RAISE_AMOUNT,
    totalTokensAllocated: TOTAL_TOKENS_ALLOCATED.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../presale-deployment.json'),
    JSON.stringify(deploymentData, null, 2)
  );
  console.log("Deployment info saved to presale-deployment.json");

  console.log("\nDeployment Summary:");
  console.log(`StudioPresale: ${presaleAddress}`);
  console.log(`STORecovery: ${recoveryAddress}`);
  console.log(`USDT Address: ${USDT_ADDRESS}`);
  console.log(`Base Token Price: ${BASE_TOKEN_PRICE} (0.06 USDT per STO token)`);
  console.log(`Min Purchase Amount: ${MIN_PURCHASE_AMOUNT} ($50)`);
  console.log(`Target Raise Amount: ${TARGET_RAISE_AMOUNT} ($1.2M)`);
  console.log(`Total Tokens Allocated: ${ethers.formatEther(TOTAL_TOKENS_ALLOCATED)} (20M tokens)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
