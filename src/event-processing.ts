import { ethers } from 'ethers';
import { ChainRuntime } from './types';
import { 
  processedDeposits, 
  processedTxHashes, 
  saveProcessedDeposits, 
  saveProcessedTxHashes, 
  getUniqueNonce 
} from './state-manager';
import { chainRuntimes } from './chain-setup';
import { setHandleDepositEventFunction } from './chain-monitoring';
import { sendStoGasToUser as sendStoGasToUserUtil } from './transaction-utils';
import config from '../multichain.config';

/**
 * Handle a single deposit event on chain 'runtime.chainId'.
 * We'll parse the event, see "destChainID", and attempt to call voteProposal on that chain's Bridge.
 */
export async function handleDepositEvent(runtime: ChainRuntime, event: ethers.EventLog): Promise<void> {
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

// Register the handleDepositEvent function with chain-monitoring
setHandleDepositEventFunction(handleDepositEvent);

/**
 * Submit a proposal to the destination chain's bridge
 */
export async function submitProposal(
  originChainId: number,
  depositNonce: bigint,
  depositer: string,
  resourceID: string,
  data: string,
  depositId: string,
  destRuntime: ChainRuntime,
  txHash?: string
): Promise<void> {
  let retries = 0;
  let success = false;
  let retryDelay = 5000; // Default retry delay

  while (retries < 10 && !success) { // Use maxRetries from config
    try {
      // Generate a unique nonce for this deposit
      const uniqueNonce = getUniqueNonce(originChainId, depositNonce, depositer, txHash);
      
      console.log(
        `Submitting proposal for deposit ${depositId} to ${destRuntime.name} (chainId=${destRuntime.chainId}), attempt ${
          retries + 1
        }/10`
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
      `Failed to submit proposal for deposit ${depositId} to ${destRuntime.name} chain after 10 attempts`
    );
  }
}

/**
 * Send a small amount of STO tokens to a user who bridged USDT from BSC to Studio
 * This provides them with gas to transfer their bridged USDT tokens
 */
export async function sendStoGasToUser(recipientAddress: string, studioRuntime: ChainRuntime): Promise<void> {
  // Use the implementation from transaction-utils.ts
  await sendStoGasToUserUtil(recipientAddress, studioRuntime, config.stoGasProvider);
}

/**
 * Process a transaction manually
 * This is used when a transaction is missed by the relayer
 */
export async function processManualTransaction(txHash: string): Promise<void> {
  console.log(`Manually processing transaction: ${txHash}`);
  
  // Check if we've already processed this transaction
  if (processedTxHashes.has(txHash)) {
    console.log(`Transaction ${txHash} already processed, skipping manual processing`);
    return;
  }
  
  // Try to process the transaction on each chain
  for (const runtime of chainRuntimes.values()) {
    try {
      console.log(`Checking for deposit events in transaction ${txHash} on ${runtime.name}...`);
      
      // Get transaction receipt
      const txReceipt = await runtime.provider.getTransactionReceipt(txHash);
      if (!txReceipt) {
        console.log(`Transaction ${txHash} not found on ${runtime.name}, skipping`);
        continue;
      }
      
      // Check if the transaction was successful
      if (txReceipt.status !== 1) {
        console.log(`Transaction ${txHash} failed on ${runtime.name}, skipping`);
        continue;
      }
      
      // Check for Deposit events
      const depositFilter = runtime.bridge.filters.Deposit();
      let foundDepositEvent = false;
      
      for (const log of txReceipt.logs) {
        // Check if this log is from the bridge contract and is a Deposit event
        if (log.address.toLowerCase() === runtime.bridge.target.toString().toLowerCase() && 
            log.topics[0] === ethers.id("Deposit(uint256,bytes32,uint64,address,bytes,uint256,bytes32)")) {
          
          foundDepositEvent = true;
          console.log(`Found Deposit event in transaction ${txHash} on ${runtime.name}`);
          
          // Process the event
          await handleDepositEvent(runtime, log as ethers.EventLog);
        }
      }
      
      if (!foundDepositEvent) {
        console.log(`No Deposit events found in transaction ${txHash} on ${runtime.name}`);
      }
    } catch (error) {
      console.error(`Error processing manual transaction ${txHash} on ${runtime.name}:`, error);
    }
  }
}
