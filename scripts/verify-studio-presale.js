const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('hardhat');

async function main() {
  // Load deployment info
  const presaleDeploymentPath = path.resolve(__dirname, '../presale-deployment.json');
  const presaleDeploymentData = JSON.parse(fs.readFileSync(presaleDeploymentPath, 'utf8'));
  
  console.log("Verifying Studio presale contracts...");
  
  // Contract addresses
  const presaleAddress = presaleDeploymentData.presale;
  const recoveryAddress = presaleDeploymentData.recovery;
  
  // Constructor arguments
  const presaleArgs = [
    presaleDeploymentData.usdt, // USDT token address
    presaleDeploymentData.baseTokenPrice, // Base token price
    presaleDeploymentData.minPurchaseAmount, // Minimum purchase amount
    presaleDeploymentData.targetRaiseAmount, // Target raise amount
    presaleDeploymentData.totalTokensAllocated // Total tokens allocated
  ];
  
  // Verify StudioPresale contract
  console.log(`\nVerifying StudioPresale contract at ${presaleAddress}...`);
  console.log("Constructor arguments:", presaleArgs);
  
  try {
    // Create a contract factory to encode the constructor arguments
    const StudioPresale = await ethers.getContractFactory("StudioPresale");
    const encodedArgs = StudioPresale.interface.encodeDeploy(presaleArgs);
    
    console.log("Encoded constructor arguments:", encodedArgs);
    
    // Print the command to verify the contract
    console.log("\nTo verify the StudioPresale contract, use the following command in the Studio blockchain explorer:");
    console.log(`Contract Address: ${presaleAddress}`);
    console.log(`Contract Name: StudioPresale`);
    console.log(`Compiler Version: v0.8.0`);
    console.log(`Optimization: Enabled with 200 runs`);
    console.log(`EVM Version: istanbul`);
    console.log(`Constructor Arguments: ${encodedArgs}`);
    
    // Verify STORecovery contract
    console.log(`\nVerifying STORecovery contract at ${recoveryAddress}...`);
    
    // Print the command to verify the contract
    console.log("\nTo verify the STORecovery contract, use the following command in the Studio blockchain explorer:");
    console.log(`Contract Address: ${recoveryAddress}`);
    console.log(`Contract Name: STORecovery`);
    console.log(`Compiler Version: v0.8.0`);
    console.log(`Optimization: Enabled with 200 runs`);
    console.log(`EVM Version: istanbul`);
    console.log(`Constructor Arguments: 0x`);
    
    console.log("\nVerification process completed!");
  } catch (error) {
    console.error("Error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
