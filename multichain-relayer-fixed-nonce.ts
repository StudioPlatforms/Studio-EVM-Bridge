import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables first
dotenv.config();

import config, { SingleChainConfig } from './multichain.config';

// Add confirmation delay constants
const BSC_CONFIRMATIONS = 25; // More confirmations for BSC due to higher throughput
const STUDIO_CONFIRMATIONS = 10; // Fewer confirmations needed for Studio chain

// Use a minimal ABI instead of loading the full ABI from a file
// This helps avoid ABI mismatches
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

interface ChainRuntime {
  name: string;
  chainId: number;
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  bridge: ethers.Contract;
  lastPolledBlock: number; // track how far we've polled
}

// We'll store a "chainId -> ChainRuntime" mapping
const chainRuntimes: Map<number, ChainRuntime> = new Map();

// Track processed deposits so we don't double submit
// This will persist across relayer restarts by saving to a file
const processedDeposits = new Set<string>();

// Track processed transaction hashes to avoid double processing after restarts
const processedTxHashes = new Set<string>();

// Map of deposit keys to unique nonces
// Key format: originChainId-depositNonce-depositer
const nonceMapping = new Map<string, bigint>();

// File to store processed deposits
const PROCESSED_DEPOSITS_FILE = 'processed-deposits.json';

// File to store processed transaction hashes
const PROCESSED_TX_HASHES_FILE = 'processed-tx-hashes.json';

// Load processed deposits from file
try {
  if (fs.existsSync(PROCESSED_DEPOSITS_FILE)) {
    const savedDeposits = JSON.parse(fs.readFileSync(PROCESSED_DEPOSITS_FILE, 'utf8'));
    savedDeposits.forEach((depositId: string) => processedDeposits.add(depositId));
    console.log(`Loaded ${processedDeposits.size} processed deposits from file`);
  }
} catch (error) {
  console.error(`Error loading processed deposits: ${error}`);
}

// Load processed transaction hashes from file
try {
  if (fs.existsSync(PROCESSED_TX_HASHES_FILE)) {
    const savedTxHashes = JSON.parse(fs.readFileSync(PROCESSED_TX_HASHES_FILE, 'utf8'));
    savedTxHashes.forEach((txHash: string) => processedTxHashes.add(txHash));
    console.log(`Loaded ${processedTxHashes.size} processed transaction hashes from file`);
  }
} catch (error) {
  console.error(`Error loading processed transaction hashes: ${error}`);
}

// Save processed deposits to file
function saveProcessedDeposits() {
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

// Save processed transaction hashes to file
function saveProcessedTxHashes() {
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

// Generate a unique nonce for each deposit
function getUniqueNonce(originChainId: number, depositNonce: bigint, depositer: string, txHash?: string): bigint {
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
 * Main function to initialize and start the relayer
 */
async function startRelayer() {
  console.log('Starting multi-chain relayer with fixed nonce generation...');
  console.log(`Version: 1.5.0 (Enhanced Block Processing)`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  // Log the relayer address derived from the private key
  const wallet = new ethers.Wallet(config.chains[0].privateKey);
  console.log(`Relayer address: ${wallet.address}`);

  // Build up runtime objects for each chain in config
  for (const chain of config.chains) {
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
              provider = null; // Reset provider to null to indicate failure
            }
          }
        }
        
        // If all RPC URLs failed, skip this chain
        if (!provider) {
          console.error(`❌ All RPC URLs failed for ${chain.name}. Skipping chain initialization.`);
          continue;
        }
      }
      
      const wallet = new ethers.Wallet(chain.privateKey, provider);
      
      // Check if contract exists at the address
      const code = await provider.getCode(chain.bridgeAddress);
      if (code === '0x') {
        console.error(`❌ No contract found at ${chain.bridgeAddress} on ${chain.name}`);
        console.error(`Skipping ${chain.name} chain initialization`);
        continue;
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
      const startBlock = currentBlock - effectiveOffset;

      const runtime: ChainRuntime = {
        name: chain.name,
        chainId: chain.chainId,
        provider,
        wallet,
        bridge,
        lastPolledBlock: startBlock,
      };

      chainRuntimes.set(chain.chainId, runtime);

      console.log(`✅ Initialized ${chain.name} chain (chainId=${chain.chainId})`);
      console.log(`  Bridge: ${chain.bridgeAddress}`);
      console.log(`  RPC URL: ${chain.rpcUrl}`);
      console.log(`  Starting from block: ${startBlock} (current: ${currentBlock}, offset: ${effectiveOffset})`);
      console.log(`  Config offset: ${startBlockOffset}, Minimum offset: ${minOffset}, Effective offset: ${effectiveOffset}`);

      // Check relayer registration
      try {
        console.log(`Checking if ${wallet.address} is registered as a relayer on ${chain.name}...`);
        const isRelayer = await bridge.isRelayer(wallet.address);
        console.log(`✅ Relayer is ${isRelayer ? '' : 'NOT '}registered on ${chain.name} Bridge.`);

        if (!isRelayer) {
          console.error(
            `❌ Relayer is not registered on ${chain.name} Bridge. Please register the relayer before starting.`
          );
          process.exit(1);
        }
      } catch (error) {
        console.error(`❌ Error checking relayer status on ${chain.name}:`, error);
        console.error(`This could indicate an ABI mismatch or that the contract is not a Bridge contract`);
        console.error(`Skipping ${chain.name} chain initialization`);
        continue;
      }
    } catch (error) {
      console.error(`❌ Error initializing ${chain.name} chain:`, error);
      console.error(`Skipping ${chain.name} chain initialization`);
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
  console.log('Relayer started. Polling each chain...');

  // For each chain, set up a polling interval
  for (const runtime of chainRuntimes.values()) {
    setInterval(async () => {
      await pollChainDeposits(runtime);
    }, config.pollingInterval);
  }
}

/**
 * Try to get a working provider for a chain, using fallback URLs if necessary
 */
async function getWorkingProvider(chain: SingleChainConfig, currentProvider: ethers.JsonRpcProvider): Promise<ethers.JsonRpcProvider | null> {
  // First try the current provider
  try {
    await currentProvider.getBlockNumber();
    return currentProvider; // Current provider is working fine
  } catch (error) {
    console.error(`❌ Current provider for ${chain.name} failed:`, error);
    
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
      }
    }
    
    // If all fallbacks failed, return null
    console.error(`❌ All RPC URLs failed for ${chain.name}`);
    return null;
  }
}

/**
 * Poll one chain for new Deposit events from lastPolledBlock + 1 to current block.
 * If we see deposit events meant for chain X, call voteProposal on chain X's Bridge.
 * Process multiple blocks at once to catch up faster when behind.
 */
async function pollChainDeposits(runtime: ChainRuntime) {
  try {
    // Find the chain config for this runtime
    const chainConfig = config.chains.find(c => c.chainId === runtime.chainId);
    if (!chainConfig) {
      console.error(`Cannot find chain config for chainId=${runtime.chainId}`);
      return;
    }
    
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
          await handleDepositEvent(runtime, event as ethers.EventLog);
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
 * Handle a single deposit event on chain 'runtime.chainId'.
 * We'll parse the event, see "destChainID", and attempt to call voteProposal on that chain's Bridge.
 */
async function handleDepositEvent(runtime: ChainRuntime, event: ethers.EventLog) {
  if (!event.args) {
    console.error(`Event has no args, skipping`);
    return;
  }

  const args = event.args;
  console.log('Event args:', args);

  const destChainID = args[0];
  const resourceID = args[1];
  const depositNonce = args[2];
  const depositer = args[3];
  const recipientBytes = args[4];
  const amount = args[5];

  // Handle special depositer addresses (e.g., 0x0000000000000000000000000000000000000017)
  // These are used as identifiers by the bridge contract
  let actualDepositer = depositer;
  let specialDepositer = false;
  const recipientAddr = ethers.getAddress(ethers.hexlify(recipientBytes).slice(0, 42));
  
  if (depositer.toString().startsWith('0x000000000000000000000000000000000000')) {
    console.log(`Special depositer address detected: ${depositer}`);
    specialDepositer = true;
    // We'll still use the special depositer in the deposit ID to ensure uniqueness
    console.log(`Recipient address: ${recipientAddr}`);
  }

  // Get the transaction hash to ensure uniqueness
  const txHash = event.transactionHash;
  
  // Check if we've already processed this transaction hash
  if (processedTxHashes.has(txHash)) {
    console.log(`Transaction ${txHash} already processed, skipping`);
    return;
  }
  
  // Construct a depositId for local tracking
  // depositId = "originChainId-destChainId-depositNonce-depositer-specialFlag-recipient-txHash"
  // Include both depositer address, recipient, and transaction hash to ensure unique deposit IDs
  const depositId = specialDepositer 
    ? `${runtime.chainId}-${destChainID}-${depositNonce.toString()}-${depositer}-${recipientAddr}-${txHash}`
    : `${runtime.chainId}-${destChainID}-${depositNonce.toString()}-${depositer}-${txHash}`;

  // If we already processed this deposit, skip
  if (processedDeposits.has(depositId)) {
    console.log(`Deposit ${depositId} already processed, skipping`);
    return;
  }

  console.log(
    `New deposit on ${runtime.name} (chainId=${runtime.chainId}): depositId=${depositId}, amount=${amount}, depositer=${depositer}, actualDepositer=${actualDepositer}`
  );

  // Check if the destination chain is in our config
  const destRuntime = chainRuntimes.get(Number(destChainID));
  if (!destRuntime) {
    console.log(
      `Skipping deposit ${depositId}: no known chain config for destChainID=${destChainID}`
    );
    return;
  }

  // If the deposit was meant for the same chain, skip
  if (destRuntime.chainId === runtime.chainId) {
    console.log(
      `Skipping deposit ${depositId}: cannot deposit to same chain (origin=dest=${runtime.chainId})`
    );
    return;
  }

  // We already have recipientAddr from above, just log it
  console.log(`Recipient address for data encoding: ${recipientAddr}`);

  // Build the data with NO double resourceID
  const data = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address', 'address'],
    [amount, depositer, recipientAddr]
  );

  // Now we attempt to call voteProposal on the destination chain
  await submitProposal(
    runtime.chainId, // originChainId
    depositNonce,
    actualDepositer, // Pass actual depositer to generate unique nonce
    resourceID,
    data,
    depositId,
    destRuntime,
    txHash // Pass the transaction hash to ensure uniqueness
  );
}

/**
 * Send a small amount of STO tokens to a user who bridged USDT from BSC to Studio
 * This provides them with gas to transfer their bridged USDT tokens
 */
async function sendStoGasToUser(recipientAddress: string, studioRuntime: ChainRuntime): Promise<void> {
  // Check if STO gas provider is configured and enabled
  if (!config.stoGasProvider || !config.stoGasProvider.enabled) {
    console.log(`STO gas provider not configured or disabled. Skipping gas token transfer.`);
    return;
  }

  try {
    // Check if the recipient already has enough STO for gas
    const recipientBalance = await studioRuntime.provider.getBalance(recipientAddress);
    const minBalanceNeeded = ethers.parseEther(config.stoGasProvider.amount);
    
    console.log(`Recipient ${recipientAddress} balance: ${ethers.formatEther(recipientBalance)} STO`);
    
    // If the recipient already has enough STO, skip sending more
    if (recipientBalance >= minBalanceNeeded) {
      console.log(`Recipient ${recipientAddress} already has ${ethers.formatEther(recipientBalance)} STO, which is enough for gas. Skipping gas token transfer.`);
      return;
    }
    
    console.log(`Sending ${config.stoGasProvider.amount} STO to ${recipientAddress} for gas...`);
    
    // Create a wallet from the STO gas provider private key
    const stoGasWallet = new ethers.Wallet(config.stoGasProvider.privateKey, studioRuntime.provider);
    
    // Get the address of the STO gas provider wallet
    const stoGasAddress = stoGasWallet.address;
    console.log(`STO gas provider address: ${stoGasAddress}`);
    
    // Check the balance of the STO gas provider
    const stoGasBalance = await studioRuntime.provider.getBalance(stoGasAddress);
    console.log(`STO gas provider balance: ${ethers.formatEther(stoGasBalance)} STO`);
    
    // Convert the amount to send to wei
    const amountToSend = ethers.parseEther(config.stoGasProvider.amount);
    
    // Check if the STO gas provider has enough balance
    if (stoGasBalance < amountToSend) {
      console.error(`STO gas provider doesn't have enough balance. Has ${ethers.formatEther(stoGasBalance)} STO, needs ${config.stoGasProvider.amount} STO`);
      return;
    }
    
    // Send the transaction
    const tx = await stoGasWallet.sendTransaction({
      to: recipientAddress,
      value: amountToSend,
      gasLimit: 21000 // Standard gas limit for a simple transfer
    });
    
    console.log(`STO gas transfer transaction submitted: ${tx.hash}`);
    
    // Wait for the transaction to be confirmed
    const receipt = await tx.wait();
    
    if (receipt && receipt.status === 1) {
      console.log(`Successfully sent ${config.stoGasProvider.amount} STO to ${recipientAddress} for gas`);
    } else {
      console.error(`Failed to send STO to ${recipientAddress} for gas`);
    }
  } catch (error) {
    console.error(`Error sending STO to ${recipientAddress} for gas:`, error);
  }
}

/**
 * Submit a proposal to the destination chain's bridge
 */
async function submitProposal(
  originChainId: number,
  depositNonce: bigint,
  depositer: string, // Added depositer parameter
  resourceID: string,
  data: string,
  depositId: string,
  destRuntime: ChainRuntime,
  txHash?: string // Add transaction hash parameter
) {
  let retries = 0;
  let success = false;
  let retryDelay = config.retryDelay;

  while (retries < config.maxRetries && !success) {
    try {
      // Generate a unique nonce for this deposit
      const uniqueNonce = getUniqueNonce(originChainId, depositNonce, depositer, txHash);
      
      console.log(
        `Submitting proposal for deposit ${depositId} to ${destRuntime.name} (chainId=${destRuntime.chainId}), attempt ${
          retries + 1
        }/${config.maxRetries}`
      );
      console.log(
        `Parameters: originChainId=${originChainId}, depositNonce=${depositNonce}, uniqueNonce=${uniqueNonce}, resourceID=${resourceID}`
      );
      console.log(`Data: ${data}`);

      // Check relayer registration
      try {
        const isRelayer = await destRuntime.bridge.isRelayer(destRuntime.wallet.address);
        console.log(`Relayer is ${isRelayer ? '' : 'NOT '}registered on ${destRuntime.name} bridge.`);

        if (!isRelayer) {
          console.error(
            `Relayer is not registered on ${destRuntime.name} bridge. Cannot submit proposal.`
          );
          return;
        }
      } catch (error) {
        console.error(`Error checking relayer status on ${destRuntime.name}:`, error);
        console.error(`This could indicate an ABI mismatch or that the contract is not a Bridge contract`);
        retries++;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
        continue;
      }

      // Check if the proposal has already been executed
      try {
        const isExecuted = await destRuntime.bridge._executedProposals(originChainId, depositNonce);
        console.log(`Proposal already executed: ${isExecuted}`);
        
        if (isExecuted) {
          console.log(`Proposal for deposit ${depositId} has already been executed, using unique nonce instead`);
          // If the proposal has already been executed, we'll use a unique nonce
          // Convert uniqueNonce to a number that fits in uint64
          const uniqueNonceUint64 = Number(uniqueNonce % BigInt(2**64));
          console.log(`Using uint64 nonce: ${uniqueNonceUint64}`);
          
          // Check if the proposal with the unique nonce has already been executed
          const isUniqueExecuted = await destRuntime.bridge._executedProposals(originChainId, uniqueNonceUint64);
          console.log(`Proposal with unique nonce already executed: ${isUniqueExecuted}`);
          
          if (isUniqueExecuted) {
            console.log(`Proposal with unique nonce ${uniqueNonceUint64} has already been executed, skipping`);
            processedDeposits.add(depositId);
            success = true;
            continue;
          }
          
          // Call voteProposal with the unique nonce
          const tx = await destRuntime.bridge.voteProposal(originChainId, uniqueNonceUint64, resourceID, data, {
            gasLimit: 500000,
          });
          console.log(`Transaction submitted: ${tx.hash}`);
          
          const receipt = await tx.wait();
          if (receipt && receipt.status === 1) {
            console.log(
              `Proposal for deposit ${depositId} submitted successfully to ${destRuntime.name} chain with unique nonce ${uniqueNonceUint64}`
            );
            processedDeposits.add(depositId);
            saveProcessedDeposits(); // Save to file when a deposit is processed
            
            // Add the transaction hash to the processed tx hashes set
            if (txHash) {
              processedTxHashes.add(txHash);
              saveProcessedTxHashes(); // Save to file when a tx hash is processed
            }
            
            success = true;
            
            // If this is a USDT transfer from BSC to Studio, send STO gas to the recipient
            if (originChainId === 56 && destRuntime.chainId === 240241) {
              // Extract the recipient address from the data
              const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(
                ['uint256', 'address', 'address'],
                data
              );
              const recipientAddress = decodedData[2]; // The recipient address is the third parameter
              
              // Send STO gas to the recipient
              await sendStoGasToUser(recipientAddress, destRuntime);
            }
          } else {
            console.error(`Transaction failed for deposit ${depositId} on ${destRuntime.name} chain`);
            retries++;
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            retryDelay *= 2;
          }
        } else {
          // If the proposal has not been executed, we'll use the original nonce
          console.log(`Using original nonce: ${depositNonce}`);
          
          // Call voteProposal with the original nonce
          const tx = await destRuntime.bridge.voteProposal(originChainId, depositNonce, resourceID, data, {
            gasLimit: 500000,
          });
          console.log(`Transaction submitted: ${tx.hash}`);
          
          const receipt = await tx.wait();
          if (receipt && receipt.status === 1) {
            console.log(
              `Proposal for deposit ${depositId} submitted successfully to ${destRuntime.name} chain with original nonce ${depositNonce}`
            );
            processedDeposits.add(depositId);
            saveProcessedDeposits(); // Save to file when a deposit is processed
            
            // Add the transaction hash to the processed tx hashes set
            if (txHash) {
              processedTxHashes.add(txHash);
              saveProcessedTxHashes(); // Save to file when a tx hash is processed
            }
            
            success = true;
            
            // If this is a USDT transfer from BSC to Studio, send STO gas to the recipient
            if (originChainId === 56 && destRuntime.chainId === 240241) {
              // Extract the recipient address from the data
              const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(
                ['uint256', 'address', 'address'],
                data
              );
              const recipientAddress = decodedData[2]; // The recipient address is the third parameter
              
              // Send STO gas to the recipient
              await sendStoGasToUser(recipientAddress, destRuntime);
            }
          } else {
            console.error(`Transaction failed for deposit ${depositId} on ${destRuntime.name} chain`);
            retries++;
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            retryDelay *= 2;
          }
        }
      } catch (error) {
        console.error(
          `Error submitting proposal for deposit ${depositId} to ${destRuntime.name} chain:`,
          error
        );
        retries++;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
      }
    } catch (error) {
      console.error(
        `Error submitting proposal for deposit ${depositId} to ${destRuntime.name} chain:`,
        error
      );
      retries++;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay *= 2;
    }
  }

  if (!success) {
    console.error(
      `Failed to submit proposal for deposit ${depositId} to ${destRuntime.name} chain after ${config.maxRetries} attempts`
    );
  }
}

// Start the relayer
startRelayer().catch((error) => {
  console.error('Relayer error:', error);
  process.exit(1);
});
