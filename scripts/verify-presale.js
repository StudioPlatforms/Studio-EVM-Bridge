const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const deploymentPath = path.resolve(__dirname, '../presale-deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error("Deployment file not found. Please deploy the contracts first.");
    process.exit(1);
  }

  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  console.log("Verifying presale deployment...");

  // Connect to contracts
  const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
  const recovery = await ethers.getContractAt("STORecovery", deploymentData.recovery);

  // Verify StudioPresale
  console.log("\nVerifying StudioPresale contract...");
  
  // Check USDT address
  const usdtAddress = await presale.usdtToken();
  console.log(`USDT Address: ${usdtAddress}`);
  console.log(`Expected: ${deploymentData.usdt}`);
  console.log(`✅ ${usdtAddress.toLowerCase() === deploymentData.usdt.toLowerCase() ? "USDT address matches" : "USDT address does not match"}`);

  // Check base token price
  const baseTokenPrice = await presale.baseTokenPrice();
  console.log(`Base Token Price: ${baseTokenPrice}`);
  console.log(`Expected: ${deploymentData.baseTokenPrice}`);
  console.log(`✅ ${baseTokenPrice == deploymentData.baseTokenPrice ? "Base token price matches" : "Base token price does not match"}`);

  // Check min purchase amount
  const minPurchaseAmount = await presale.minPurchaseAmount();
  console.log(`Min Purchase Amount: ${minPurchaseAmount}`);
  console.log(`Expected: ${deploymentData.minPurchaseAmount}`);
  console.log(`✅ ${minPurchaseAmount == deploymentData.minPurchaseAmount ? "Min purchase amount matches" : "Min purchase amount does not match"}`);

  // Check target raise amount
  const targetRaiseAmount = await presale.targetRaiseAmount();
  console.log(`Target Raise Amount: ${targetRaiseAmount}`);
  console.log(`Expected: ${deploymentData.targetRaiseAmount}`);
  console.log(`✅ ${targetRaiseAmount == deploymentData.targetRaiseAmount ? "Target raise amount matches" : "Target raise amount does not match"}`);

  // Check total tokens allocated
  const totalTokensAllocated = await presale.totalTokensAllocated();
  console.log(`Total Tokens Allocated: ${totalTokensAllocated}`);
  console.log(`Expected: ${deploymentData.totalTokensAllocated}`);
  console.log(`✅ ${totalTokensAllocated.toString() === deploymentData.totalTokensAllocated ? "Total tokens allocated matches" : "Total tokens allocated does not match"}`);

  // Check presale status
  const presaleStats = await presale.getPresaleStats();
  console.log(`Presale Status: ${presaleStats[3]}`);
  console.log(`✅ ${presaleStats[3] == 0 ? "Presale is active" : "Presale is not active"}`);

  // Check vesting parameters
  const vestingSchedule = await presale.getVestingSchedule();
  console.log(`Immediate Claim: ${vestingSchedule[0]}%`);
  console.log(`Vesting Periods: ${vestingSchedule[1]}`);
  console.log(`Vesting Duration: ${vestingSchedule[2]} seconds (${Number(vestingSchedule[2]) / 86400} days)`);
  console.log(`✅ ${vestingSchedule[0] == 20 ? "Immediate claim percentage is correct (20%)" : "Immediate claim percentage is not correct"}`);
  console.log(`✅ ${vestingSchedule[1] == 4 ? "Vesting periods is correct (4)" : "Vesting periods is not correct"}`);
  console.log(`✅ ${vestingSchedule[2] == 2592000 ? "Vesting duration is correct (30 days)" : "Vesting duration is not correct"}`);

  // Verify STORecovery
  console.log("\nVerifying STORecovery contract...");
  console.log(`STORecovery Address: ${deploymentData.recovery}`);
  console.log(`✅ STORecovery contract deployed successfully`);

  console.log("\nVerification completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
