const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Amount to deposit (in STO tokens)
const AMOUNT_TO_DEPOSIT = "20000000"; // 20 million STO tokens

async function main() {
  // Load deployment info
  const deploymentPath = path.resolve(__dirname, '../presale-deployment.json');
  if (!fs.existsSync(deploymentPath)) {
    console.error("Deployment file not found. Please deploy the contracts first.");
    process.exit(1);
  }

  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  
  const amountWei = ethers.parseEther(AMOUNT_TO_DEPOSIT);
  console.log(`Depositing ${AMOUNT_TO_DEPOSIT} STO tokens to the presale contract...`);
  
  const presale = await ethers.getContractAt("StudioPresale", deploymentData.presale);
  
  // Check current STO balance before deposit
  const stoBalanceBefore = await presale.stoBalance();
  console.log(`Current STO balance before deposit: ${ethers.formatEther(stoBalanceBefore)} STO tokens`);
  
  // Deposit STO tokens
  const tx = await presale.depositSTO({ value: amountWei });
  await tx.wait();
  
  console.log(`Successfully deposited ${AMOUNT_TO_DEPOSIT} STO tokens to the presale contract.`);
  
  // Check STO balance after deposit
  const stoBalanceAfter = await presale.stoBalance();
  console.log(`Current STO balance after deposit: ${ethers.formatEther(stoBalanceAfter)} STO tokens`);
  
  // Check total tokens allocated
  const totalTokensAllocated = await presale.totalTokensAllocated();
  console.log(`Total tokens allocated: ${ethers.formatEther(totalTokensAllocated)} STO tokens`);
  
  // Verify that we have enough STO tokens for the presale
  if (stoBalanceAfter >= totalTokensAllocated) {
    console.log(`✅ The presale contract has enough STO tokens for the presale.`);
  } else {
    console.log(`❌ The presale contract does not have enough STO tokens for the presale.`);
    console.log(`   Missing: ${ethers.formatEther(totalTokensAllocated - stoBalanceAfter)} STO tokens`);
  }
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
