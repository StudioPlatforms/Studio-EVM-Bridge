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
  console.log("Getting presale status...");
  
  const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
  
  // Get presale stats
  const presaleStats = await presale.getPresaleStats();
  const statusMap = ["Active", "FilledSuccessfully", "Canceled"];
  console.log(`\nPresale Status:`);
  console.log(`Status: ${statusMap[presaleStats[3]]}`);
  console.log(`Total raised: ${ethers.formatUnits(presaleStats[0], 6)} USDT`);
  console.log(`Contributors count: ${presaleStats[1]}`);
  console.log(`Final token price: ${ethers.formatUnits(presaleStats[2], 6)} USDT per STO token`);
  
  // Get STO balance
  const stoBalance = await presale.stoBalance();
  console.log(`\nSTO Balance: ${ethers.formatEther(stoBalance)} STO tokens`);
  
  // Get total tokens allocated
  const totalTokensAllocated = await presale.totalTokensAllocated();
  console.log(`Total tokens allocated: ${ethers.formatEther(totalTokensAllocated)} STO tokens`);
  
  // Get vesting parameters
  const vestingSchedule = await presale.getVestingSchedule();
  console.log(`\nVesting Parameters:`);
  console.log(`Immediate claim: ${vestingSchedule[0]}%`);
  console.log(`Vesting periods: ${vestingSchedule[1]}`);
  console.log(`Vesting duration: ${Number(vestingSchedule[2]) / (24 * 60 * 60)} days`);
  console.log(`Presale end time: ${vestingSchedule[3] > 0 ? new Date(Number(vestingSchedule[3]) * 1000).toISOString() : "Not set"}`);
  
  // Check if paused
  const isPaused = await presale.paused();
  console.log(`\nPresale is ${isPaused ? "paused" : "not paused"}`);
  
  // Get owner
  const owner = await presale.owner();
  console.log(`\nOwner: ${owner}`);
  console.log(`Expected owner: ${deploymentData.deployer}`);
  console.log(`✅ ${owner.toLowerCase() === deploymentData.deployer.toLowerCase() ? "Owner matches" : "Owner does not match"}`);
  
  console.log("\nPresale is ready for contributions!");
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
