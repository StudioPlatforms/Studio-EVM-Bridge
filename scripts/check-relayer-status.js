const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// BSC RPC URL
const BSC_RPC_URL = "https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c";

// Minimal Bridge ABI
const minimalBridgeAbi = [
  // Events
  "event Deposit(uint256 indexed destChainID, bytes32 indexed resourceID, uint64 depositNonce, address indexed depositer, bytes recipient, uint256 amount, bytes32 dataHash)",
  "event ProposalVote(uint256 originChainID, uint64 depositNonce, uint8 status, bytes32 dataHash)",
  "event ProposalExecution(uint256 originChainID, uint64 depositNonce, bytes32 dataHash)",
  
  // Functions
  "function isRelayer(address) view returns (bool)",
  "function voteProposal(uint256 originChainID, uint64 depositNonce, bytes32 resourceID, bytes calldata data) returns ()",
  "function _chainID() view returns (uint256)",
  "function owner() view returns (address)",
  "function _executedProposals(uint256 originChainID, uint64 depositNonce) view returns (bool)"
];

async function main() {
  // Load deployment info
  const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
  const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
  
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  // Get the relayer address from the private key
  const privateKey = process.env.PRIVATE_KEY || '404316727c14825a918b088141420255518ad9ae17ebd062b5364a6fd8d68dff';
  const relayerWallet = new ethers.Wallet(privateKey);
  const relayerAddress = relayerWallet.address;
  console.log(`Relayer address: ${relayerAddress}`);
  
  // Check BSC Bridge
  console.log(`\nChecking BSC Bridge...`);
  const bscBridgeAddress = bscDeploymentData.bridge;
  console.log(`BSC bridge address: ${bscBridgeAddress}`);
  
  // Get BSC provider
  const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);
  
  // Get BSC bridge contract with the same ABI as the relayer
  const bscBridge = new ethers.Contract(bscBridgeAddress, minimalBridgeAbi, bscProvider);
  
  // Check if the relayer is registered on BSC Bridge
  try {
    console.log(`Checking if ${relayerAddress} is registered as a relayer on BSC...`);
    const isBscRelayer = await bscBridge.isRelayer(relayerAddress);
    console.log(`✅ Relayer is ${isBscRelayer ? '' : 'NOT '}registered on BSC Bridge.`);
    
    // Get the owner of the BSC Bridge
    const bscOwner = await bscBridge.owner();
    console.log(`BSC Bridge owner: ${bscOwner}`);
    
    // Get the chain ID from the bridge
    const bscChainId = await bscBridge._chainID();
    console.log(`BSC Bridge chain ID: ${bscChainId}`);
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
  
  // Get Studio bridge contract with the same ABI as the relayer
  const studioBridge = new ethers.Contract(studioBridgeAddress, minimalBridgeAbi, studioProvider);
  
  // Check if the relayer is registered on Studio Bridge
  try {
    console.log(`Checking if ${relayerAddress} is registered as a relayer on Studio...`);
    const isStudioRelayer = await studioBridge.isRelayer(relayerAddress);
    console.log(`✅ Relayer is ${isStudioRelayer ? '' : 'NOT '}registered on Studio Bridge.`);
    
    // Get the owner of the Studio Bridge
    const studioOwner = await studioBridge.owner();
    console.log(`Studio Bridge owner: ${studioOwner}`);
    
    // Get the chain ID from the bridge
    const studioChainId = await studioBridge._chainID();
    console.log(`Studio Bridge chain ID: ${studioChainId}`);
  } catch (error) {
    console.error(`Error checking relayer status on Studio:`, error);
  }
  
  // Check if the transaction is within the polling range
  console.log(`\nChecking if transaction is within polling range...`);
  
  // Transaction hash to check
  const TX_HASH = "0x0447c70a0c3df5cf55ee0fa45191f96211acc966e0d16ae74ea9d9dc84348b02";
  
  // Get transaction receipt
  const txReceipt = await bscProvider.getTransactionReceipt(TX_HASH);
  if (!txReceipt) {
    console.error(`Transaction not found: ${TX_HASH}`);
    return;
  }
  
  const txBlockNumber = txReceipt.blockNumber;
  const currentBlock = await bscProvider.getBlockNumber();
  
  console.log(`Transaction block number: ${txBlockNumber}`);
  console.log(`Current block number: ${currentBlock}`);
  console.log(`Blocks since transaction: ${currentBlock - txBlockNumber}`);
  
  // The relayer uses a minimum offset of 3000 blocks for BSC
  const minOffset = 3000;
  if (currentBlock - txBlockNumber > minOffset) {
    console.log(`\nWARNING: The transaction is ${currentBlock - txBlockNumber} blocks old, which is more than the minimum offset (${minOffset}).`);
    console.log(`This means the relayer might have missed this transaction because it's too old.`);
  } else {
    console.log(`\nThe transaction is ${currentBlock - txBlockNumber} blocks old, which is within the minimum offset (${minOffset}).`);
    console.log(`The relayer should be able to pick up this transaction.`);
  }
  
  // Check for Deposit events in the transaction
  console.log(`\nChecking for Deposit events in the transaction...`);
  
  const depositFilter = bscBridge.filters.Deposit();
  const depositEvents = await bscBridge.queryFilter(depositFilter, txBlockNumber, txBlockNumber);
  
  if (depositEvents.length > 0) {
    console.log(`Found ${depositEvents.length} Deposit events in block ${txBlockNumber}`);
    
    for (const event of depositEvents) {
      console.log(`\nDeposit event:`);
      console.log(`  Destination chain ID: ${event.args[0]}`);
      console.log(`  Resource ID: ${event.args[1]}`);
      console.log(`  Deposit nonce: ${event.args[2]}`);
      console.log(`  Depositer: ${event.args[3]}`);
      
      // Check if this event is for the transaction we're interested in
      if (event.transactionHash === TX_HASH) {
        console.log(`  This event is from our transaction!`);
      }
    }
  } else {
    console.log(`No Deposit events found in block ${txBlockNumber}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
