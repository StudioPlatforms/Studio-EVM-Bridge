const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration for the new token
// These values should be provided as command-line arguments in a real script
const TOKEN_NAME = "New Token";
const TOKEN_SYMBOL = "NEWT";
const BSC_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with actual address
const STUDIO_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with actual address
const RESOURCE_ID = "0x0000000000000000000000000000000000000000000000000000000000000000"; // Generate a unique resource ID

async function main() {
  // Get the network name
  const network = hre.network.name;
  console.log(`Adding ${TOKEN_NAME} to the bridge on ${network}...`);

  // Load deployment info based on network
  const deploymentPath = path.resolve(__dirname, `../${network}-deployment.json`);
  let deploymentData;
  
  try {
    deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  } catch (error) {
    console.error(`Error loading deployment data: ${error.message}`);
    console.error(`Make sure ${deploymentPath} exists and is valid JSON.`);
    process.exit(1);
  }

  // Get the bridge and handler addresses
  const bridgeAddress = deploymentData.bridge;
  const handlerAddress = deploymentData.erc20HandlerFixed;

  console.log(`Bridge address: ${bridgeAddress}`);
  console.log(`ERC20HandlerFixed address: ${handlerAddress}`);

  // Get the token address based on the network
  const tokenAddress = network === "bsc" ? BSC_TOKEN_ADDRESS : STUDIO_TOKEN_ADDRESS;
  console.log(`Token address: ${tokenAddress}`);

  // Get contract instances
  const bridge = await ethers.getContractAt("Bridge", bridgeAddress);
  const handler = await ethers.getContractAt("ERC20HandlerFixed", handlerAddress);

  // Set the resource ID in the bridge
  console.log(`Setting resource ID ${RESOURCE_ID} for token ${tokenAddress}...`);
  const setResourceTx = await bridge.setResource(RESOURCE_ID, handlerAddress);
  console.log(`Transaction hash: ${setResourceTx.hash}`);
  await setResourceTx.wait();
  console.log(`Resource ID set in bridge contract.`);

  // Set the resource ID in the handler
  console.log(`Setting resource in handler...`);
  const setResourceHandlerTx = await handler.setResource(RESOURCE_ID, tokenAddress);
  console.log(`Transaction hash: ${setResourceHandlerTx.hash}`);
  await setResourceHandlerTx.wait();
  console.log(`Resource set in handler contract.`);

  // Auto-detect token decimals
  console.log(`Auto-detecting token decimals...`);
  const autoDetectTx = await handler.autoDetectDecimals(RESOURCE_ID);
  console.log(`Transaction hash: ${autoDetectTx.hash}`);
  await autoDetectTx.wait();
  console.log(`Token decimals auto-detected.`);

  // Get the chain ID
  const chainId = network === "bsc" ? 56 : 240241;

  // Set the token decimals explicitly if needed
  // This is useful if auto-detection doesn't work or if you want to override the detected value
  // const decimals = network === "bsc" ? 18 : 6; // Example: 18 decimals on BSC, 6 on Studio
  // console.log(`Setting token decimals to ${decimals}...`);
  // const setDecimalsTx = await handler.setTokenDecimals(RESOURCE_ID, chainId, decimals);
  // console.log(`Transaction hash: ${setDecimalsTx.hash}`);
  // await setDecimalsTx.wait();
  // console.log(`Token decimals set.`);

  // Verify the token decimals
  const tokenDecimals = await handler.getTokenDecimals(RESOURCE_ID, chainId);
  console.log(`Token decimals: ${tokenDecimals}`);

  // Update the deployment file with the new token
  deploymentData.resources = deploymentData.resources || {};
  deploymentData.resources[TOKEN_SYMBOL.toLowerCase()] = {
    resourceID: RESOURCE_ID,
    tokenAddress: tokenAddress
  };
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentData, null, 2), 'utf8');
  console.log(`Deployment file updated with new token information.`);

  console.log(`\n${TOKEN_NAME} (${TOKEN_SYMBOL}) has been successfully added to the bridge on ${network}.`);
  console.log(`Resource ID: ${RESOURCE_ID}`);
  console.log(`Token Address: ${tokenAddress}`);
  console.log(`Token Decimals: ${tokenDecimals}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
