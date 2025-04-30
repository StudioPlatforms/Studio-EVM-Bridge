const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// The address to register as a relayer
// In a real script, this would be provided as a command-line argument
const RELAYER_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with actual address

async function main() {
  console.log(`Registering relayer ${RELAYER_ADDRESS} on BSC chain...`);

  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  let bscDeploymentData;
  
  try {
    bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  } catch (error) {
    console.error(`Error loading deployment data: ${error.message}`);
    console.error(`Make sure ${bscDeploymentPath} exists and is valid JSON.`);
    process.exit(1);
  }

  // Get the bridge address
  const bridgeAddress = bscDeploymentData.bridge;
  console.log(`Bridge address: ${bridgeAddress}`);

  // Get the Bridge contract instance
  const bridge = await ethers.getContractAt("Bridge", bridgeAddress);

  // Check if the address is already a relayer
  const isRelayer = await bridge.isRelayer(RELAYER_ADDRESS);
  
  if (isRelayer) {
    console.log(`${RELAYER_ADDRESS} is already registered as a relayer on the BSC bridge.`);
    return;
  }

  // Register the address as a relayer
  console.log(`Registering ${RELAYER_ADDRESS} as a relayer...`);
  const tx = await bridge.addRelayer(RELAYER_ADDRESS);
  console.log(`Transaction hash: ${tx.hash}`);
  
  // Wait for the transaction to be confirmed
  await tx.wait();
  console.log(`Transaction confirmed.`);

  // Verify that the address is now a relayer
  const isRelayerAfter = await bridge.isRelayer(RELAYER_ADDRESS);
  
  if (isRelayerAfter) {
    console.log(`✅ ${RELAYER_ADDRESS} has been successfully registered as a relayer on the BSC bridge.`);
  } else {
    console.error(`❌ Failed to register ${RELAYER_ADDRESS} as a relayer on the BSC bridge.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
