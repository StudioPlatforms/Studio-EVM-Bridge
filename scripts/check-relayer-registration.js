const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  console.log(`Checking relayer registration status...`);
  
  // Get the relayer address from the private key
  const privateKey = process.env.PRIVATE_KEY || '404316727c14825a918b088141420255518ad9ae17ebd062b5364a6fd8d68dff';
  const relayerWallet = new ethers.Wallet(privateKey);
  const relayerAddress = relayerWallet.address;
  console.log(`Relayer address: ${relayerAddress}`);
  
  // Check BSC Bridge
  console.log(`\nChecking BSC Bridge...`);
  const bscBridgeAddress = bscDeploymentData.bridge;
  console.log(`BSC bridge address: ${bscBridgeAddress}`);
  
  // Get BSC provider - use the specified Ankr RPC URL
  const bscRpcUrl = "https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c";
  const bscProvider = new ethers.JsonRpcProvider(bscRpcUrl);
  
  // Get BSC bridge contract
  const bscBridgeAbi = [
    "function isRelayer(address) view returns (bool)",
    "function owner() view returns (address)"
  ];
  const bscBridge = new ethers.Contract(bscBridgeAddress, bscBridgeAbi, bscProvider);
  
  // Check if the relayer is registered on BSC Bridge
  try {
    const isBscRelayer = await bscBridge.isRelayer(relayerAddress);
    console.log(`Relayer is ${isBscRelayer ? '' : 'NOT '}registered on BSC Bridge`);
    
    // Get the owner of the BSC Bridge
    const bscOwner = await bscBridge.owner();
    console.log(`BSC Bridge owner: ${bscOwner}`);
  } catch (error) {
    console.error(`Error checking relayer status on BSC:`, error);
  }
  
  // Check Studio Bridge
  console.log(`\nChecking Studio Bridge...`);
  const studioBridgeAddress = studioDeploymentData.bridge;
  console.log(`Studio bridge address: ${studioBridgeAddress}`);
  
  // Get Studio provider
  const studioRpcUrl = "https://mainnet.studio-blockchain.com";
  const studioProvider = new ethers.JsonRpcProvider(studioRpcUrl);
  
  // Get Studio bridge contract
  const studioBridgeAbi = [
    "function isRelayer(address) view returns (bool)",
    "function owner() view returns (address)"
  ];
  const studioBridge = new ethers.Contract(studioBridgeAddress, studioBridgeAbi, studioProvider);
  
  // Check if the relayer is registered on Studio Bridge
  try {
    const isStudioRelayer = await studioBridge.isRelayer(relayerAddress);
    console.log(`Relayer is ${isStudioRelayer ? '' : 'NOT '}registered on Studio Bridge`);
    
    // Get the owner of the Studio Bridge
    const studioOwner = await studioBridge.owner();
    console.log(`Studio Bridge owner: ${studioOwner}`);
  } catch (error) {
    console.error(`Error checking relayer status on Studio:`, error);
  }
  
  // Summary
  console.log(`\nSummary:`);
  console.log(`Relayer address: ${relayerAddress}`);
  console.log(`To register the relayer on BSC Bridge, run:`);
  console.log(`node scripts/register-relayer-bsc.js`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
