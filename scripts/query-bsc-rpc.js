const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Transaction hash to check
const TX_HASH = "0x0447c70a0c3df5cf55ee0fa45191f96211acc966e0d16ae74ea9d9dc84348b02";

// BSC RPC URL
const BSC_RPC_URL = "https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c";

async function main() {
  console.log(`Manually querying BSC RPC URL: ${BSC_RPC_URL}`);
  
  // First, let's check if the RPC URL is responsive
  try {
    const response = await axios.post(BSC_RPC_URL, {
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1
    });
    
    const blockNumber = parseInt(response.data.result, 16);
    console.log(`RPC is responsive. Current block number: ${blockNumber}`);
  } catch (error) {
    console.error(`Error querying RPC URL:`, error.message);
    return;
  }
  
  // Now, let's check if the RPC URL can see the transaction
  try {
    const response = await axios.post(BSC_RPC_URL, {
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [TX_HASH],
      id: 1
    });
    
    if (response.data.result) {
      console.log(`Transaction found!`);
      console.log(`Status: ${parseInt(response.data.result.status, 16) === 1 ? "Success" : "Failed"}`);
      console.log(`Block number: ${parseInt(response.data.result.blockNumber, 16)}`);
      console.log(`Gas used: ${parseInt(response.data.result.gasUsed, 16)}`);
      
      // Check if there are logs
      if (response.data.result.logs && response.data.result.logs.length > 0) {
        console.log(`\nTransaction has ${response.data.result.logs.length} logs`);
        
        // Define the Deposit event signature
        const depositEventSignature = "Deposit(uint256,bytes32,uint64,address,bytes,uint256,bytes32)";
        const depositEventTopic = ethers.id(depositEventSignature);
        
        // Check if any of the logs is a Deposit event
        let hasDepositEvent = false;
        for (const log of response.data.result.logs) {
          if (log.topics[0] === depositEventTopic) {
            hasDepositEvent = true;
            console.log(`\nFound Deposit event in log:`);
            console.log(`  Address: ${log.address}`);
            console.log(`  Topics: ${log.topics.join(', ')}`);
            
            // Try to decode the log data
            try {
              // The first topic is the event signature, the rest are indexed parameters
              const destChainID = parseInt(log.topics[1], 16);
              console.log(`  Destination chain ID: ${destChainID}`);
            } catch (error) {
              console.error(`  Error decoding log data:`, error.message);
            }
          }
        }
        
        if (!hasDepositEvent) {
          console.log(`No Deposit event found in transaction logs`);
        }
      } else {
        console.log(`Transaction has no logs`);
      }
    } else {
      console.log(`Transaction not found`);
    }
  } catch (error) {
    console.error(`Error querying transaction:`, error.message);
  }
  
  // Let's also check if the relayer is polling the correct block range
  try {
    // Get the transaction
    const txResponse = await axios.post(BSC_RPC_URL, {
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [TX_HASH],
      id: 1
    });
    
    if (txResponse.data.result) {
      const txBlockNumber = parseInt(txResponse.data.result.blockNumber, 16);
      
      // Get the current block number
      const blockResponse = await axios.post(BSC_RPC_URL, {
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1
      });
      
      const currentBlockNumber = parseInt(blockResponse.data.result, 16);
      
      console.log(`\nTransaction block number: ${txBlockNumber}`);
      console.log(`Current block number: ${currentBlockNumber}`);
      console.log(`Blocks since transaction: ${currentBlockNumber - txBlockNumber}`);
      
      // The relayer uses a minimum offset of 3000 blocks for BSC
      if (currentBlockNumber - txBlockNumber > 3000) {
        console.log(`\nWARNING: The transaction is ${currentBlockNumber - txBlockNumber} blocks old, which is more than the effective offset (3000).`);
        console.log(`This means the relayer might have missed this transaction because it's too old.`);
      } else {
        console.log(`\nThe transaction is ${currentBlockNumber - txBlockNumber} blocks old, which is within the effective offset (3000).`);
        console.log(`The relayer should be able to pick up this transaction.`);
      }
    }
  } catch (error) {
    console.error(`Error checking block range:`, error.message);
  }
  
  // Let's check if the relayer is registered on the bridge
  try {
    // Get the relayer address from the private key
    const privateKey = process.env.PRIVATE_KEY || '404316727c14825a918b088141420255518ad9ae17ebd062b5364a6fd8d68dff';
    const relayerWallet = new ethers.Wallet(privateKey);
    const relayerAddress = relayerWallet.address;
    
    console.log(`\nRelayer address: ${relayerAddress}`);
    
    // Load deployment info
    const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
    const bscDeploymentData = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
    
    // Get the bridge address
    const bridgeAddress = bscDeploymentData.bridge;
    
    // Check if the relayer is registered on the bridge using ethers.js Contract
    const bridgeAbi = [
      "function isRelayer(address) view returns (bool)",
      "function owner() view returns (address)"
    ];
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const bridge = new ethers.Contract(bridgeAddress, bridgeAbi, provider);
    
    const isRelayer = await bridge.isRelayer(relayerAddress);
    console.log(`Relayer is ${isRelayer ? '' : 'NOT '}registered on BSC Bridge (using ethers.js Contract)`);
    
    // Also check using the RPC call method for comparison
    const response = await axios.post(BSC_RPC_URL, {
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{
        to: bridgeAddress,
        data: `0x7eee288d000000000000000000000000${relayerAddress.slice(2)}` // isRelayer(address)
      }, "latest"],
      id: 1
    });
    
    console.log(`RPC call result: ${response.data.result}`);
    const isRelayerRpc = response.data.result === "0x0000000000000000000000000000000000000000000000000000000000000001";
    console.log(`Relayer is ${isRelayerRpc ? '' : 'NOT '}registered on BSC Bridge (using RPC call)`);
  } catch (error) {
    console.error(`Error checking relayer registration:`, error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
