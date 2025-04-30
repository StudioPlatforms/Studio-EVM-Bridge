import { ethers } from 'ethers';
import { 
  ChainRuntime, 
  SingleChainConfig, 
  BSC_CONFIRMATIONS, 
  STUDIO_CONFIRMATIONS,
  minimalBridgeAbi
} from './types';
import { updateRelayerHealth, relayerHealthy } from './state-manager';
import { chainRuntimes, getWorkingProvider } from './chain-setup';
import config from '../multichain.config';
import { sendChainHealthAlert, sendRelayerHealthAlert } from './email-notifications';

// Forward declaration to avoid circular dependency
let handleDepositEventFunction: (runtime: ChainRuntime, event: ethers.EventLog) => Promise<void>;

export function setHandleDepositEventFunction(fn: (runtime: ChainRuntime, event: ethers.EventLog) => Promise<void>) {
  handleDepositEventFunction = fn;
}

/**
 * Check the health of a chain
 */
export async function checkChainHealth(runtime: ChainRuntime, chainConfig: SingleChainConfig): Promise<void> {
  try {
    // Try to get the current block number
    await runtime.provider.getBlockNumber();
    
    // If we get here, the chain is healthy
    const wasUnhealthy = !runtime.isHealthy;
    if (wasUnhealthy) {
      console.log(`✅ ${runtime.name} chain is now healthy`);
      
      // Send email notification for chain health recovery
      if (config.emailNotifications) {
        await sendChainHealthAlert(
          config.emailNotifications,
          runtime.name,
          true,
          `The ${runtime.name} chain has recovered and is now healthy.`
        );
      }
    }
    runtime.isHealthy = true;
    runtime.lastHealthCheckTime = Date.now();
    
    // Store previous relayer health state
    const wasRelayerHealthy = relayerHealthy;
    
    // Update overall relayer health
    updateRelayerHealth(chainRuntimes);
    
    // If relayer health status changed, send notification
    if (!wasRelayerHealthy && relayerHealthy && config.emailNotifications) {
      await sendRelayerHealthAlert(
        config.emailNotifications,
        true,
        `The relayer has recovered and is now healthy. All chains are operational.`
      );
    }
  } catch (error: any) {
    console.error(`❌ Health check failed for ${runtime.name} chain:`, error);
    
    const wasHealthy = runtime.isHealthy;
    runtime.isHealthy = false;
    runtime.lastHealthCheckTime = Date.now();
    
    // Send email notification for chain health issue
    if (wasHealthy && config.emailNotifications) {
      await sendChainHealthAlert(
        config.emailNotifications,
        runtime.name,
        false,
        `The ${runtime.name} chain is experiencing issues: ${error.message || error}`
      );
    }
    
    // Try to reconnect
    console.log(`Attempting to reconnect to ${runtime.name} RPC...`);
    const workingProvider = await getWorkingProvider(chainConfig, runtime.provider);
    if (workingProvider) {
      console.log(`✅ Reconnected to ${runtime.name} RPC`);
      
      // Update the runtime with the new provider
      const wallet = new ethers.Wallet(chainConfig.privateKey, workingProvider);
      const bridge = new ethers.Contract(chainConfig.bridgeAddress, minimalBridgeAbi, wallet);
      
      runtime.provider = workingProvider;
      runtime.wallet = wallet;
      runtime.bridge = bridge;
      runtime.isHealthy = true;
      
      // Send email notification for successful reconnection
      if (config.emailNotifications) {
        await sendChainHealthAlert(
          config.emailNotifications,
          runtime.name,
          true,
          `Successfully reconnected to ${runtime.name} RPC.`
        );
      }
    }
    
    // Store previous relayer health state
    const wasRelayerHealthy = relayerHealthy;
    
    // Update overall relayer health
    updateRelayerHealth(chainRuntimes);
    
    // If relayer health status changed, send notification
    if (wasRelayerHealthy && !relayerHealthy && config.emailNotifications) {
      await sendRelayerHealthAlert(
        config.emailNotifications,
        false,
        `The relayer is unhealthy. One or more chains are experiencing issues.`
      );
    }
  }
}

/**
 * Poll one chain for new Deposit events from lastPolledBlock + 1 to current block.
 * If we see deposit events meant for chain X, call voteProposal on chain X's Bridge.
 * Process multiple blocks at once to catch up faster when behind.
 */
export async function pollChainDeposits(runtime: ChainRuntime, chainConfig: SingleChainConfig): Promise<void> {
  try {
    // Try to get a working provider
    let currentBlock: number;
    try {
      currentBlock = await runtime.provider.getBlockNumber();
    } catch (error) {
      console.error(`Error getting block number for ${runtime.name}:`, error);
      console.log(`Attempting to reconnect to ${runtime.name} RPC...`);
      
      // Try to get a working provider
      const workingProvider = await getWorkingProvider(chainConfig, runtime.provider);
      if (!workingProvider) {
        console.error(`Failed to reconnect to ${runtime.name} RPC. Skipping this polling cycle.`);
        return;
      }
      
      // Update the runtime with the new provider
      const wallet = new ethers.Wallet(chainConfig.privateKey, workingProvider);
      const bridge = new ethers.Contract(chainConfig.bridgeAddress, minimalBridgeAbi, wallet);
      
      runtime.provider = workingProvider;
      runtime.wallet = wallet;
      runtime.bridge = bridge;
      
      // Try again with the new provider
      currentBlock = await runtime.provider.getBlockNumber();
      console.log(`✅ Reconnected to ${runtime.name} RPC. Current block: ${currentBlock}`);
    }

    // Apply confirmation delay based on chain
    const confirmations = runtime.chainId === 56 ? BSC_CONFIRMATIONS : STUDIO_CONFIRMATIONS;
    const confirmedBlock = currentBlock - confirmations;
    
    console.log(`Current block: ${currentBlock}, confirmed block: ${confirmedBlock} (${confirmations} confirmations)`);
    
    // if no new blocks after applying confirmation delay, do nothing
    if (confirmedBlock <= runtime.lastPolledBlock) {
      console.log(`No new confirmed blocks for ${runtime.name} (chainId=${runtime.chainId}). Skipping this polling cycle.`);
      return;
    }

    // Calculate how many blocks to process in this batch
    // Process up to 50 blocks at a time to catch up faster when behind
    // But limit to 10 blocks when close to current block to avoid overloading the RPC
    const blocksBehind = confirmedBlock - runtime.lastPolledBlock;
    const maxBlocksPerBatch = blocksBehind > 100 ? 50 : (blocksBehind > 20 ? 10 : 5);
    const blocksToProcess = Math.min(blocksBehind, maxBlocksPerBatch);
    
    const fromBlock = runtime.lastPolledBlock + 1;
    const toBlock = Math.min(fromBlock + blocksToProcess - 1, confirmedBlock);

    console.log(
      `Polling for deposit events on ${runtime.name} chain (chainId=${runtime.chainId}) from block ${fromBlock} to ${toBlock} (${blocksToProcess} blocks, ${blocksBehind} blocks behind)`
    );

    try {
      // For BSC, use a more aggressive approach to ensure we don't miss events
      const depositFilter = runtime.bridge.filters.Deposit();
      
      // Log the filter details for debugging
      console.log(`Using filter: ${JSON.stringify(depositFilter)}`);
      
      // Query for events
      const depositEvents = await runtime.bridge.queryFilter(depositFilter, fromBlock, toBlock);
      
      // Log more details about the query
      console.log(`Query completed for ${runtime.name} (chainId=${runtime.chainId}), found ${depositEvents.length} events`);
      
      // Only update lastPolledBlock after successful query
      runtime.lastPolledBlock = toBlock;

      if (depositEvents.length > 0) {
        console.log(
          `Found ${depositEvents.length} new Deposit events on ${runtime.name} (chainId=${runtime.chainId})`
        );
        for (const event of depositEvents) {
          if (handleDepositEventFunction) {
            await handleDepositEventFunction(runtime, event as ethers.EventLog);
          } else {
            console.error('handleDepositEventFunction is not set');
          }
        }
      }
    } catch (err) {
      console.error(`Error querying for events on ${runtime.name} (chainId=${runtime.chainId}):`, err);
      // Don't update lastPolledBlock if the query failed, so we'll retry these blocks
    }
  } catch (err) {
    console.error(`Error polling chainId=${runtime.chainId}:`, err);
  }
}

/**
 * Perform a deep scan for missed transactions
 */
export async function performDeepScan(runtime: ChainRuntime, chainConfig: SingleChainConfig): Promise<void> {
  if (!chainConfig.deepScanBlocks) {
    console.log(`Deep scanning not configured for ${runtime.name}, skipping`);
    return;
  }
  
  console.log(`\n🔍 Starting deep scan for ${runtime.name} chain...`);
  
  try {
    // Get the current block number
    const currentBlock = await runtime.provider.getBlockNumber();
    
    // Calculate the start block for the deep scan
    const startBlock = Math.max(1, currentBlock - chainConfig.deepScanBlocks);
    
    console.log(`Deep scanning ${runtime.name} from block ${startBlock} to ${currentBlock} (${currentBlock - startBlock} blocks)`);
    
    // Update the last deep scan time
    runtime.lastDeepScanTime = Date.now();
    
    // Process blocks in batches to avoid overloading the RPC
    const batchSize = 100;
    for (let fromBlock = startBlock; fromBlock < currentBlock; fromBlock += batchSize) {
      const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);
      
      console.log(`Deep scanning ${runtime.name} blocks ${fromBlock} to ${toBlock}...`);
      
      try {
        // Query for deposit events in this batch
        const depositFilter = runtime.bridge.filters.Deposit();
        const depositEvents = await runtime.bridge.queryFilter(depositFilter, fromBlock, toBlock);
        
        console.log(`Found ${depositEvents.length} deposit events in blocks ${fromBlock} to ${toBlock}`);
        
        // Process each event
        for (const event of depositEvents) {
          if (handleDepositEventFunction) {
            await handleDepositEventFunction(runtime, event as ethers.EventLog);
          } else {
            console.error('handleDepositEventFunction is not set');
          }
        }
      } catch (error) {
        console.error(`Error deep scanning ${runtime.name} blocks ${fromBlock} to ${toBlock}:`, error);
      }
      
      // Add a small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ Completed deep scan for ${runtime.name} chain`);
  } catch (error) {
    console.error(`Error performing deep scan for ${runtime.name} chain:`, error);
  }
}
