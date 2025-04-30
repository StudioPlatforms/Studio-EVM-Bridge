import { ethers } from 'ethers';
import { ChainRuntime } from './types';
import * as http from 'http';
import { processedTxHashes } from './state-manager';
import { processManualTransaction } from './event-processing';

/**
 * Send a small amount of STO tokens to a user who bridged USDT from BSC to Studio
 * This provides them with gas to transfer their bridged USDT tokens
 */
export async function sendStoGasToUser(recipientAddress: string, studioRuntime: ChainRuntime, stoGasProvider: any): Promise<void> {
  // Check if STO gas provider is configured and enabled
  if (!stoGasProvider || !stoGasProvider.enabled) {
    console.log(`STO gas provider not configured or disabled. Skipping gas token transfer.`);
    return;
  }

  try {
    // Check if the recipient already has enough STO for gas
    const recipientBalance = await studioRuntime.provider.getBalance(recipientAddress);
    const minBalanceNeeded = ethers.parseEther(stoGasProvider.amount);
    
    console.log(`Recipient ${recipientAddress} balance: ${ethers.formatEther(recipientBalance)} STO`);
    
    // If the recipient already has enough STO, skip sending more
    if (recipientBalance >= minBalanceNeeded) {
      console.log(`Recipient ${recipientAddress} already has ${ethers.formatEther(recipientBalance)} STO, which is enough for gas. Skipping gas token transfer.`);
      return;
    }
    
    console.log(`Sending ${stoGasProvider.amount} STO to ${recipientAddress} for gas...`);
    
    // Create a wallet from the STO gas provider private key
    const stoGasWallet = new ethers.Wallet(stoGasProvider.privateKey, studioRuntime.provider);
    
    // Get the address of the STO gas provider wallet
    const stoGasAddress = stoGasWallet.address;
    console.log(`STO gas provider address: ${stoGasAddress}`);
    
    // Check the balance of the STO gas provider
    const stoGasBalance = await studioRuntime.provider.getBalance(stoGasAddress);
    console.log(`STO gas provider balance: ${ethers.formatEther(stoGasBalance)} STO`);
    
    // Convert the amount to send to wei
    const amountToSend = ethers.parseEther(stoGasProvider.amount);
    
    // Check if the STO gas provider has enough balance
    if (stoGasBalance < amountToSend) {
      console.error(`STO gas provider doesn't have enough balance. Has ${ethers.formatEther(stoGasBalance)} STO, needs ${stoGasProvider.amount} STO`);
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
      console.log(`Successfully sent ${stoGasProvider.amount} STO to ${recipientAddress} for gas`);
    } else {
      console.error(`Failed to send STO to ${recipientAddress} for gas`);
    }
  } catch (error) {
    console.error(`Error sending STO to ${recipientAddress} for gas:`, error);
  }
}

/**
 * Set up a simple HTTP server for health monitoring and transaction verification
 */
export function setupHealthServer(chainRuntimes: Map<number, ChainRuntime>, relayerHealthy: boolean): void {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      // Check if all chains are healthy
      let allHealthy = true;
      const healthStatus: Record<string, any> = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        chains: {}
      };
      
      chainRuntimes.forEach((runtime, chainId) => {
        healthStatus.chains[runtime.name] = {
          isHealthy: runtime.isHealthy,
          lastHealthCheckTime: new Date(runtime.lastHealthCheckTime).toISOString(),
          lastPolledBlock: runtime.lastPolledBlock
        };
        
        if (!runtime.isHealthy) {
          allHealthy = false;
          healthStatus.status = 'degraded';
        }
      });
      
      if (!allHealthy) {
        res.statusCode = 503; // Service Unavailable
      } else {
        res.statusCode = 200;
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(healthStatus, null, 2));
    } else if (req.url?.startsWith('/verify/')) {
      // Transaction verification endpoint
      const txHash = req.url.substring('/verify/'.length);
      if (!txHash || txHash.length !== 66) { // 0x + 64 hex chars
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid transaction hash format' }));
        return;
      }
      
      const isProcessed = processedTxHashes.has(txHash);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        txHash,
        processed: isProcessed,
        timestamp: new Date().toISOString()
      }));
    } else if (req.url?.startsWith('/process/')) {
      // Manual processing endpoint
      const txHash = req.url.substring('/process/'.length);
      if (!txHash || txHash.length !== 66) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid transaction hash format' }));
        return;
      }
      
      // Queue the transaction for manual processing
      console.log(`Received request to manually process transaction: ${txHash}`);
      res.statusCode = 202; // Accepted
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        txHash,
        status: 'queued',
        message: 'Transaction queued for manual processing',
        timestamp: new Date().toISOString()
      }));
      
      // Trigger processing in the background
      processManualTransaction(txHash).catch(error => {
        console.error(`Error processing manual transaction ${txHash}:`, error);
      });
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  
  // Use port 3001 instead of 3000
  const port = process.env.HEALTH_PORT || 3001;
  // Listen on all interfaces (0.0.0.0) instead of just localhost
  server.listen({
    port: Number(port),
    host: '0.0.0.0'
  }, () => {
    console.log(`Health monitoring server running on port ${port}`);
    console.log(`Health endpoint: http://0.0.0.0:${port}/health`);
    console.log(`Transaction verification endpoint: http://0.0.0.0:${port}/verify/{txHash}`);
    console.log(`Manual processing endpoint: http://0.0.0.0:${port}/process/{txHash}`);
  });
}
