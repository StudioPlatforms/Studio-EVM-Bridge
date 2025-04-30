import { ethers } from 'ethers';

// Chain configuration interfaces
export interface SingleChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  bridgeAddress: string;
  privateKey: string;
  startBlockOffset?: number;
  deepScanBlocks?: number;
  deepScanInterval?: number;
}

export interface MultiChainRelayerConfig {
  chains: SingleChainConfig[];
  pollingInterval: number;
  maxRetries: number;
  retryDelay: number;
  saveStateInterval?: number;
  stoGasProvider?: {
    privateKey: string;
    amount: string;
    enabled: boolean;
  };
}

// Runtime interfaces
export interface ChainRuntime {
  name: string;
  chainId: number;
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  bridge: ethers.Contract;
  lastPolledBlock: number;
  lastDeepScanTime: number;
  isHealthy: boolean;
  lastHealthCheckTime: number;
}

export interface RelayerState {
  nonceMapping: Record<string, string>;
  lastPolledBlocks: Record<number, number>;
  lastSaved: string;
}

// Constants
export const BSC_CONFIRMATIONS = 25;
export const STUDIO_CONFIRMATIONS = 10;
export const ALERT_COOLDOWN = 3600000; // 1 hour in milliseconds

// Minimal Bridge ABI
export const minimalBridgeAbi = [
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

// File paths
export const PROCESSED_DEPOSITS_FILE = 'processed-deposits.json';
export const PROCESSED_TX_HASHES_FILE = 'processed-tx-hashes.json';
export const RELAYER_STATE_FILE = 'relayer-state.json';
