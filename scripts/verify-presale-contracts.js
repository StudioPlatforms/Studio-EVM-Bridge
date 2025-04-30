const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const presaleDeploymentPath = path.resolve(__dirname, '../presale-deployment.json');
  const presaleDeploymentData = JSON.parse(fs.readFileSync(presaleDeploymentPath, 'utf8'));
  
  console.log("Verifying Studio presale contracts...");
  
  // Verify StudioPresale contract
  console.log("\nVerifying StudioPresale contract...");
  try {
    await hre.run("verify:verify", {
      address: presaleDeploymentData.presale,
      contract: "contracts/presale/StudioPresale.sol:StudioPresale",
      constructorArguments: [
        presaleDeploymentData.usdt, // USDT token address
        presaleDeploymentData.baseTokenPrice, // Base token price
        presaleDeploymentData.minPurchaseAmount, // Minimum purchase amount
        presaleDeploymentData.targetRaiseAmount, // Target raise amount
        presaleDeploymentData.totalTokensAllocated // Total tokens allocated
      ]
    });
    console.log(`✅ StudioPresale contract verified successfully at ${presaleDeploymentData.presale}`);
  } catch (error) {
    console.log(`❌ Error verifying StudioPresale contract: ${error.message}`);
  }
  
  // Verify STORecovery contract
  console.log("\nVerifying STORecovery contract...");
  try {
    await hre.run("verify:verify", {
      address: presaleDeploymentData.recovery,
      contract: "contracts/presale/STORecovery.sol:STORecovery",
      constructorArguments: []
    });
    console.log(`✅ STORecovery contract verified successfully at ${presaleDeploymentData.recovery}`);
  } catch (error) {
    console.log(`❌ Error verifying STORecovery contract: ${error.message}`);
  }
  
  console.log("\nPresale contract verification process completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
