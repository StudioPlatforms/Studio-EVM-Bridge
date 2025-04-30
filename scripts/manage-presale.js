const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load deployment info
const deploymentPath = path.resolve(__dirname, '../presale-deployment.json');
if (!fs.existsSync(deploymentPath)) {
  console.error("Deployment file not found. Please deploy the contracts first.");
  process.exit(1);
}

const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

// Available commands
const commands = {
  // Deposit STO tokens to the presale contract
  depositSTO: async (amount) => {
    const amountWei = ethers.parseEther(amount);
    console.log(`Depositing ${amount} STO tokens to the presale contract...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const tx = await presale.depositSTO({ value: amountWei });
    await tx.wait();
    
    console.log(`Successfully deposited ${amount} STO tokens to the presale contract.`);
    
    // Check STO balance
    const stoBalance = await presale.stoBalance();
    console.log(`Current STO balance: ${ethers.formatEther(stoBalance)} STO tokens`);
  },
  
  // Finalize the presale
  finalizePresale: async (successful) => {
    console.log(`Finalizing presale as ${successful ? "successful" : "unsuccessful"}...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const tx = await presale.finalizePresale(successful);
    await tx.wait();
    
    console.log(`Successfully finalized presale as ${successful ? "successful" : "unsuccessful"}.`);
    
    // Check presale status
    const presaleStats = await presale.getPresaleStats();
    const statusMap = ["Active", "FilledSuccessfully", "Canceled"];
    console.log(`Current presale status: ${statusMap[presaleStats[3]]}`);
  },
  
  // Update vesting parameters
  updateVesting: async (immediateClaim, vestingPeriods, vestingDuration) => {
    console.log(`Updating vesting parameters...`);
    console.log(`Immediate claim: ${immediateClaim}%`);
    console.log(`Vesting periods: ${vestingPeriods}`);
    console.log(`Vesting duration: ${vestingDuration} days`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const tx = await presale.updateVestingParameters(
      immediateClaim,
      vestingPeriods,
      vestingDuration * 24 * 60 * 60 // Convert days to seconds
    );
    await tx.wait();
    
    console.log(`Successfully updated vesting parameters.`);
    
    // Check vesting parameters
    const vestingSchedule = await presale.getVestingSchedule();
    console.log(`Current vesting parameters:`);
    console.log(`Immediate claim: ${vestingSchedule[0]}%`);
    console.log(`Vesting periods: ${vestingSchedule[1]}`);
    console.log(`Vesting duration: ${Number(vestingSchedule[2]) / (24 * 60 * 60)} days`);
  },
  
  // Pause the presale
  pausePresale: async () => {
    console.log(`Pausing presale...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const tx = await presale.pause();
    await tx.wait();
    
    console.log(`Successfully paused presale.`);
  },
  
  // Unpause the presale
  unpausePresale: async () => {
    console.log(`Unpausing presale...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const tx = await presale.unpause();
    await tx.wait();
    
    console.log(`Successfully unpaused presale.`);
  },
  
  // Get presale stats
  getStats: async () => {
    console.log(`Getting presale stats...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    
    // Get presale stats
    const presaleStats = await presale.getPresaleStats();
    const statusMap = ["Active", "FilledSuccessfully", "Canceled"];
    console.log(`Presale status: ${statusMap[presaleStats[3]]}`);
    console.log(`Total raised: ${presaleStats[0]} USDT (${ethers.formatUnits(presaleStats[0], 6)} USDT)`);
    console.log(`Contributors count: ${presaleStats[1]}`);
    console.log(`Final token price: ${presaleStats[2]} (${ethers.formatUnits(presaleStats[2], 6)} USDT per STO token)`);
    
    // Get STO balance
    const stoBalance = await presale.stoBalance();
    console.log(`STO balance: ${ethers.formatEther(stoBalance)} STO tokens`);
    
    // Get total tokens allocated
    const totalTokensAllocated = await presale.totalTokensAllocated();
    console.log(`Total tokens allocated: ${ethers.formatEther(totalTokensAllocated)} STO tokens`);
    
    // Get vesting parameters
    const vestingSchedule = await presale.getVestingSchedule();
    console.log(`Vesting parameters:`);
    console.log(`Immediate claim: ${vestingSchedule[0]}%`);
    console.log(`Vesting periods: ${vestingSchedule[1]}`);
    console.log(`Vesting duration: ${Number(vestingSchedule[2]) / (24 * 60 * 60)} days`);
    console.log(`Presale end time: ${vestingSchedule[3] > 0 ? new Date(Number(vestingSchedule[3]) * 1000).toISOString() : "Not set"}`);
  },
  
  // Get leaderboard
  getLeaderboard: async () => {
    console.log(`Getting leaderboard...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const leaderboard = await presale.getLeaderboard();
    
    console.log(`Leaderboard:`);
    for (let i = 0; i < leaderboard[0].length; i++) {
      if (leaderboard[0][i] === ethers.ZeroAddress) break;
      console.log(`${i + 1}. ${leaderboard[0][i]}: ${ethers.formatUnits(leaderboard[1][i], 6)} USDT`);
    }
  },
  
  // Withdraw funds after successful presale
  withdrawFunds: async () => {
    console.log(`Withdrawing funds...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const tx = await presale.withdrawFunds();
    await tx.wait();
    
    console.log(`Successfully withdrew funds.`);
  },
  
  // Emergency drain contract
  emergencyDrain: async () => {
    console.log(`Emergency draining contract...`);
    
    const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
    const tx = await presale.emergencyDrainContract();
    await tx.wait();
    
    console.log(`Successfully drained contract.`);
  }
};

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || !commands[command]) {
    console.log("Available commands:");
    Object.keys(commands).forEach(cmd => console.log(`- ${cmd}`));
    process.exit(1);
  }
  
  try {
    await commands[command](...args.slice(1));
  } catch (error) {
    console.error("Error executing command:", error);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
