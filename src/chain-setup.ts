import { ethers } from 'ethers';
import { 
  ChainRuntime, 
  SingleChainConfig, 
  minimalBridgeAbi
} from './types';
import config from '../multichain.config';
import { sendRpcDownAlert } from './email-notifications';

// Map of chainId to ChainRuntime
export const chainRuntimes: Map<number, ChainRuntime> = new Map();

/**
 * Initialize a chain runtime from config
 */
export async function initializeChain(chain: SingleChainConfig, savedLastPolledBlock?: number): Promise<ChainRuntime | null> {
  console.log(`\nInitializing ${chain.name} chain (chainId=${chain.chainId})...`);
  
  try {
    // Try to connect to the primary RPC URL first, then fallback to others if available
    let provider: ethers.JsonRpcProvider | null = null;
    let connectedUrl = '';
    let blockNumber = 0;
    
    // Try primary RPC URL
    try {
      provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      blockNumber = await provider.getBlockNumber();
      connectedUrl = chain.rpcUrl;
      console.log(`✅ Connected to ${chain.name} primary RPC (${chain.rpcUrl}). Current block: ${blockNumber}`);
    } catch (primaryError) {
      console.error(`❌ Failed to connect to ${chain.name} primary RPC (${chain.rpcUrl}):`, primaryError);
      
      // Send email notification for primary RPC failure
      if (config.emailNotifications) {
        await sendRpcDownAlert(
          config.emailNotifications,
          chain.name,
          chain.rpcUrl,
          primaryError
        );
      }
      
      // If fallback URLs are available, try them one by one
      if (chain.fallbackRpcUrls && chain.fallbackRpcUrls.length > 0) {
        console.log(`Trying ${chain.fallbackRpcUrls.length} fallback RPC URLs for ${chain.name}...`);
        
        for (const fallbackUrl of chain.fallbackRpcUrls) {
          try {
            console.log(`Attempting to connect to fallback RPC: ${fallbackUrl}`);
            provider = new ethers.JsonRpcProvider(fallbackUrl);
            blockNumber = await provider.getBlockNumber();
            connectedUrl = fallbackUrl;
            console.log(`✅ Connected to ${chain.name} fallback RPC (${fallbackUrl}). Current block: ${blockNumber}`);
            break; // Successfully connected to a fallback RPC
          } catch (fallbackError) {
            console.error(`❌ Failed to connect to ${chain.name} fallback RPC (${fallbackUrl}):`, fallbackError);
            
            // Send email notification for fallback RPC failure
            if (config.emailNotifications) {
              await sendRpcDownAlert(
                config.emailNotifications,
                chain.name,
                fallbackUrl,
                fallbackError
              );
            }
            
            provider = null; // Reset provider to null to indicate failure
          }
        }
      }
      
      // If all RPC URLs failed, skip this chain
      if (!provider) {
        console.error(`❌ All RPC URLs failed for ${chain.name}. Skipping chain initialization.`);
        return null;
      }
    }
    
    const wallet = new ethers.Wallet(chain.privateKey, provider);
    
    // Check if contract exists at the address
    const code = await provider.getCode(chain.bridgeAddress);
    if (code === '0x') {
      console.error(`❌ No contract found at ${chain.bridgeAddress} on ${chain.name}`);
      console.error(`Skipping ${chain.name} chain initialization`);
      return null;
    }
    console.log(`✅ Contract exists at ${chain.bridgeAddress}`);
    
    const bridge = new ethers.Contract(chain.bridgeAddress, minimalBridgeAbi, wallet);
    
    // Check chain ID from the contract
    try {
      const chainID = await bridge._chainID();
      console.log(`✅ Bridge chain ID: ${chainID}`);
      if (Number(chainID) !== chain.chainId) {
        console.warn(`⚠️ Bridge chain ID (${chainID}) does not match config chain ID (${chain.chainId})`);
      }
    } catch (error) {
      console.error(`❌ Error checking bridge chain ID:`, error);
      console.error(`This could indicate an ABI mismatch or that the contract is not a Bridge contract`);
    }

    // figure out the current block, minus some offset
    const currentBlock = await provider.getBlockNumber();
    
    // Use a larger offset for initial startup to ensure we don't miss transactions
    // This is especially important after a restart
    const startBlockOffset = chain.startBlockOffset ? chain.startBlockOffset : 5;
    // Use a minimum of 3000 blocks for BSC and 500 for Studio to catch up with any missed transactions
    const minOffset = chain.chainId === 56 ? 3000 : 500;
    const effectiveOffset = Math.max(startBlockOffset, minOffset);
    
    // Try to use the saved last polled block if available
    let startBlock = currentBlock - effectiveOffset;
    if (savedLastPolledBlock !== undefined) {
      // Use the saved block if it's not too old, otherwise use the calculated start block
      if (currentBlock - savedLastPolledBlock < effectiveOffset) {
        startBlock = savedLastPolledBlock;
        console.log(`Using saved last polled block: ${startBlock}`);
      } else {
        console.log(`Saved block is too old, using calculated start block: ${startBlock}`);
      }
    }

    const runtime: ChainRuntime = {
      name: chain.name,
      chainId: chain.chainId,
      provider,
      wallet,
      bridge,
      lastPolledBlock: startBlock,
      lastDeepScanTime: 0, // Initialize to 0 to trigger a deep scan soon after startup
      isHealthy: true, // Assume healthy at startup
      lastHealthCheckTime: Date.now()
    };

    // Check relayer registration
    try {
      console.log(`Checking if ${wallet.address} is registered as a relayer on ${chain.name}...`);
      const isRelayer = await bridge.isRelayer(wallet.address);
      console.log(`✅ Relayer is ${isRelayer ? '' : 'NOT '}registered on ${chain.name} Bridge.`);

      if (!isRelayer) {
        console.error(
          `❌ Relayer is not registered on ${chain.name} Bridge. Please register the relayer before starting.`
        );
        return null;
      }
    } catch (error) {
      console.error(`❌ Error checking relayer status on ${chain.name}:`, error);
      console.error(`This could indicate an ABI mismatch or that the contract is not a Bridge contract`);
      console.error(`Skipping ${chain.name} chain initialization`);
      return null;
    }

    console.log(`✅ Initialized ${chain.name} chain (chainId=${chain.chainId})`);
    console.log(`  Bridge: ${chain.bridgeAddress}`);
    console.log(`  RPC URL: ${connectedUrl}`);
    console.log(`  Starting from block: ${startBlock} (current: ${currentBlock}, offset: ${effectiveOffset})`);
    console.log(`  Config offset: ${startBlockOffset}, Minimum offset: ${minOffset}, Effective offset: ${effectiveOffset}`);

    return runtime;
  } catch (error) {
    console.error(`❌ Error initializing ${chain.name} chain:`, error);
    console.error(`Skipping ${chain.name} chain initialization`);
    return null;
  }
}

/**
 * Try to get a working provider for a chain, using fallback URLs if necessary
 */
export async function getWorkingProvider(chain: SingleChainConfig, currentProvider: ethers.JsonRpcProvider): Promise<ethers.JsonRpcProvider | null> {
  // First try the current provider
  try {
    await currentProvider.getBlockNumber();
    return currentProvider; // Current provider is working fine
  } catch (error) {
    console.error(`❌ Current provider for ${chain.name} failed:`, error);
    
    // Send email notification for current provider failure
    if (config.emailNotifications) {
      // Get the RPC URL from the provider
      const providerUrl = (currentProvider as any)._getConnection().url;
      await sendRpcDownAlert(
        config.emailNotifications,
        chain.name,
        providerUrl || 'Unknown URL',
        error
      );
    }
    
    // If no fallback URLs, return null
    if (!chain.fallbackRpcUrls || chain.fallbackRpcUrls.length === 0) {
      console.error(`No fallback URLs configured for ${chain.name}`);
      return null;
    }
    
    // Try each fallback URL
    console.log(`Trying ${chain.fallbackRpcUrls.length} fallback RPC URLs for ${chain.name}...`);
    
    for (const fallbackUrl of chain.fallbackRpcUrls) {
      try {
        console.log(`Attempting to connect to fallback RPC: ${fallbackUrl}`);
        const provider = new ethers.JsonRpcProvider(fallbackUrl);
        await provider.getBlockNumber(); // Test the connection
        console.log(`✅ Connected to ${chain.name} fallback RPC (${fallbackUrl})`);
        return provider;
      } catch (fallbackError) {
        console.error(`❌ Failed to connect to ${chain.name} fallback RPC (${fallbackUrl}):`, fallbackError);
        
        // Send email notification for fallback RPC failure
        if (config.emailNotifications) {
          await sendRpcDownAlert(
            config.emailNotifications,
            chain.name,
            fallbackUrl,
            fallbackError
          );
        }
      }
    }
    
    // If all fallbacks failed, return null
    console.error(`❌ All RPC URLs failed for ${chain.name}`);
    return null;
  }
}
