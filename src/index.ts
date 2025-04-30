import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import config from '../multichain.config';
import { chainRuntimes, initializeChain } from './chain-setup';
import { pollChainDeposits, checkChainHealth, performDeepScan } from './chain-monitoring';
import { initializeState, saveAllState, loadRelayerState, relayerHealthy } from './state-manager';
import { setupHealthServer } from './transaction-utils';

// Load environment variables first
dotenv.config();

/**
 * Main function to initialize and start the relayer
 */
async function startRelayer() {
  console.log('Starting multi-chain relayer with fixed nonce generation...');
  console.log(`Version: 2.0.0 (Enhanced Reliability with Deep Scanning)`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  // Initialize state
  initializeState();
  
  // Load saved last polled blocks
  const savedLastPolledBlocks = loadRelayerState();
  
  // Log the relayer address derived from the private key
  const wallet = new ethers.Wallet(config.chains[0].privateKey);
  console.log(`Relayer address: ${wallet.address}`);

  // Build up runtime objects for each chain in config
  for (const chain of config.chains) {
    const savedLastPolledBlock = savedLastPolledBlocks[chain.chainId];
    const runtime = await initializeChain(chain, savedLastPolledBlock);
    
    if (runtime) {
      chainRuntimes.set(chain.chainId, runtime);
    }
  }
  
  // Check if we have at least two chains initialized
  if (chainRuntimes.size < 2) {
    console.error(`❌ Not enough chains initialized. Need at least 2 chains to bridge between.`);
    console.error(`Only ${chainRuntimes.size} chain(s) initialized.`);
    process.exit(1);
  }

  console.log(`\n✅ Relayer initialized with ${chainRuntimes.size} chains`);
  console.log(`Polling interval: ${config.pollingInterval}ms`);
  console.log(`Save state interval: ${config.saveStateInterval || 'Not configured'}ms`);
  console.log('Relayer started. Polling each chain...');

  // For each chain, set up a polling interval
  for (const [chainId, runtime] of chainRuntimes.entries()) {
    // Find the chain config for this runtime
    const chainConfig = config.chains.find(c => c.chainId === chainId);
    if (!chainConfig) {
      console.error(`Cannot find chain config for chainId=${chainId}`);
      continue;
    }
    
    // Set up regular polling
    setInterval(async () => {
      await pollChainDeposits(runtime, chainConfig);
    }, config.pollingInterval);
    
    // Set up deep scanning for each chain
    if (chainConfig.deepScanInterval && chainConfig.deepScanBlocks) {
      console.log(`Setting up deep scanning for ${runtime.name} every ${chainConfig.deepScanInterval / 60000} minutes, scanning ${chainConfig.deepScanBlocks} blocks`);
      setInterval(async () => {
        await performDeepScan(runtime, chainConfig);
      }, chainConfig.deepScanInterval);
    }
    
    // Set up health check for each chain
    setInterval(async () => {
      await checkChainHealth(runtime, chainConfig);
    }, 60000); // Check health every minute
  }
  
  // Set up periodic state saving
  if (config.saveStateInterval) {
    setInterval(() => {
      saveAllState(chainRuntimes);
    }, config.saveStateInterval);
    console.log(`Set up periodic state saving every ${config.saveStateInterval / 60000} minutes`);
  }
  
  // Set up health monitoring HTTP server
  setupHealthServer(chainRuntimes, relayerHealthy);
}

// Start the relayer
startRelayer().catch((error) => {
  console.error('Relayer error:', error);
  process.exit(1);
});
