import * as fs from 'fs';
import { RelayerState, PROCESSED_DEPOSITS_FILE, PROCESSED_TX_HASHES_FILE, RELAYER_STATE_FILE } from './types';
import { ChainRuntime } from './types';

// Global state
export const processedDeposits = new Set<string>();
export const processedTxHashes = new Set<string>();
export const nonceMapping = new Map<string, bigint>();
export let relayerHealthy = true;
export let lastAlertTime = 0;

/**
 * Initialize state by loading from files
 */
export function initializeState(): void {
  loadProcessedDeposits();
  loadProcessedTxHashes();
  loadRelayerState();
}

/**
 * Load processed deposits from file
 */
function loadProcessedDeposits(): void {
  try {
    if (fs.existsSync(PROCESSED_DEPOSITS_FILE)) {
      const savedDeposits = JSON.parse(fs.readFileSync(PROCESSED_DEPOSITS_FILE, 'utf8'));
      savedDeposits.forEach((depositId: string) => processedDeposits.add(depositId));
      console.log(`Loaded ${processedDeposits.size} processed deposits from file`);
    }
  } catch (error) {
    console.error(`Error loading processed deposits: ${error}`);
  }
}

/**
 * Load processed transaction hashes from file
 */
function loadProcessedTxHashes(): void {
  try {
    if (fs.existsSync(PROCESSED_TX_HASHES_FILE)) {
      const savedTxHashes = JSON.parse(fs.readFileSync(PROCESSED_TX_HASHES_FILE, 'utf8'));
      savedTxHashes.forEach((txHash: string) => processedTxHashes.add(txHash));
      console.log(`Loaded ${processedTxHashes.size} processed transaction hashes from file`);
    }
  } catch (error) {
    console.error(`Error loading processed transaction hashes: ${error}`);
  }
}

/**
 * Load relayer state from file
 */
export function loadRelayerState(): Record<number, number> {
  const lastPolledBlocks: Record<number, number> = {};
  
  try {
    if (fs.existsSync(RELAYER_STATE_FILE)) {
      const savedState = JSON.parse(fs.readFileSync(RELAYER_STATE_FILE, 'utf8'));
      
      // Restore nonce mapping
      if (savedState.nonceMapping) {
        Object.entries(savedState.nonceMapping).forEach(([key, value]) => {
          nonceMapping.set(key, BigInt(value as string));
        });
        console.log(`Loaded ${nonceMapping.size} nonce mappings from file`);
      }
      
      // Restore last polled blocks
      if (savedState.lastPolledBlocks) {
        console.log(`Loaded last polled blocks from file:`);
        Object.entries(savedState.lastPolledBlocks).forEach(([chainId, blockNumber]) => {
          lastPolledBlocks[Number(chainId)] = blockNumber as number;
          console.log(`Chain ${chainId}: Block ${blockNumber}`);
        });
      }
    }
  } catch (error) {
    console.error(`Error loading relayer state: ${error}`);
  }
  
  return lastPolledBlocks;
}

/**
 * Save processed deposits to file
 */
export function saveProcessedDeposits(): void {
  try {
    fs.writeFileSync(
      PROCESSED_DEPOSITS_FILE,
      JSON.stringify(Array.from(processedDeposits)),
      'utf8'
    );
    console.log(`Saved ${processedDeposits.size} processed deposits to file`);
  } catch (error) {
    console.error(`Error saving processed deposits: ${error}`);
  }
}

/**
 * Save processed transaction hashes to file
 */
export function saveProcessedTxHashes(): void {
  try {
    fs.writeFileSync(
      PROCESSED_TX_HASHES_FILE,
      JSON.stringify(Array.from(processedTxHashes)),
      'utf8'
    );
    console.log(`Saved ${processedTxHashes.size} processed transaction hashes to file`);
  } catch (error) {
    console.error(`Error saving processed transaction hashes: ${error}`);
  }
}

/**
 * Save relayer state to file
 */
export function saveRelayerState(chainRuntimes: Map<number, ChainRuntime>): void {
  try {
    // Convert nonce mapping to a regular object for JSON serialization
    const nonceObject: Record<string, string> = {};
    nonceMapping.forEach((value, key) => {
      nonceObject[key] = value.toString();
    });
    
    // Get last polled blocks for each chain
    const lastPolledBlocks: Record<number, number> = {};
    chainRuntimes.forEach((runtime, chainId) => {
      lastPolledBlocks[chainId] = runtime.lastPolledBlock;
    });
    
    const state: RelayerState = {
      nonceMapping: nonceObject,
      lastPolledBlocks,
      lastSaved: new Date().toISOString()
    };
    
    fs.writeFileSync(
      RELAYER_STATE_FILE,
      JSON.stringify(state, null, 2),
      'utf8'
    );
    console.log(`Saved relayer state to file at ${new Date().toISOString()}`);
  } catch (error) {
    console.error(`Error saving relayer state: ${error}`);
  }
}

/**
 * Generate a unique nonce for each deposit
 */
export function getUniqueNonce(originChainId: number, depositNonce: bigint, depositer: string, txHash?: string): bigint {
  // Include txHash in the key if provided to ensure uniqueness
  const key = txHash 
    ? `${originChainId}-${depositNonce.toString()}-${depositer}-${txHash}`
    : `${originChainId}-${depositNonce.toString()}-${depositer}`;
    
  if (!nonceMapping.has(key)) {
    // Generate a new unique nonce based on timestamp and random number
    // This ensures that each deposit gets a unique nonce
    const uniqueNonce = BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
    nonceMapping.set(key, uniqueNonce);
    console.log(`Generated unique nonce ${uniqueNonce} for deposit ${key}`);
  }
  return nonceMapping.get(key)!;
}

/**
 * Update the overall relayer health status
 */
export function updateRelayerHealth(chainRuntimes: Map<number, ChainRuntime>): void {
  // Check if all chains are healthy
  let allHealthy = true;
  for (const runtime of chainRuntimes.values()) {
    if (!runtime.isHealthy) {
      allHealthy = false;
      break;
    }
  }
  
  // Update the relayer health status
  const previousHealth = relayerHealthy;
  relayerHealthy = allHealthy;
  
  // If the health status changed, log it
  if (previousHealth !== relayerHealthy) {
    if (relayerHealthy) {
      console.log(`✅ Relayer is now healthy`);
    } else {
      console.log(`❌ Relayer is now unhealthy`);
      
      // Send an alert if we haven't sent one recently
      const now = Date.now();
      if (now - lastAlertTime > 3600000) { // 1 hour cooldown
        console.error(`ALERT: Relayer is unhealthy. Check the logs for details.`);
        lastAlertTime = now;
      }
    }
  }
}

/**
 * Save all state (periodic save)
 */
export function saveAllState(chainRuntimes: Map<number, ChainRuntime>): void {
  saveRelayerState(chainRuntimes);
  saveProcessedDeposits();
  saveProcessedTxHashes();
}
