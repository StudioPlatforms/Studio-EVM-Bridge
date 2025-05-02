export interface SingleChainConfig {
  name: string;            // e.g. 'BSC', 'STUDIO', etc.
  chainId: number;         // e.g. 56 or 240241
  rpcUrl: string;
  fallbackRpcUrls?: string[]; // Fallback RPC URLs to try if the primary one fails
  bridgeAddress: string;
  privateKey: string;
  startBlockOffset?: number; // how many blocks behind to start polling
  deepScanBlocks?: number;   // how many blocks to scan during deep scans
  deepScanInterval?: number; // how often to perform deep scans (in ms)
}

export interface EmailConfig {
  enabled: boolean;
  service?: string;        // e.g. 'gmail', 'outlook', etc.
  host?: string;           // SMTP host (if not using a predefined service)
  port?: number;           // SMTP port (if not using a predefined service)
  secure?: boolean;        // Use SSL/TLS (if not using a predefined service)
  sendmail?: boolean;      // Use sendmail transport instead of SMTP
  newline?: string;        // Newline character for sendmail (unix: '\n', windows: '\r\n')
  path?: string;           // Path to sendmail command
  auth?: {
    user: string;          // Email address
    pass: string;          // Email password or app-specific password
  };
  from: string;            // Sender email address
  to: string;              // Recipient email address
  alertCooldown: number;   // Minimum time between alerts in milliseconds (to prevent spam)
}

export interface MultiChainRelayerConfig {
  chains: SingleChainConfig[];
  pollingInterval: number;
  maxRetries: number;
  retryDelay: number;
  saveStateInterval?: number; // how often to save state to disk (in ms)
  stoGasProvider?: {
    privateKey: string;
    amount: string;  // Amount of STO to send in ether units (e.g., "0.0001")
    enabled: boolean;
  };
  emailNotifications?: EmailConfig; // Email notification configuration
}

// Load private key from environment variable
// Relayer address: --the relayer address--
const privateKey = process.env.PRIVATE_KEY || ''; // New relayer private key will be set via environment variable

const config: MultiChainRelayerConfig = {
  chains: [
    {
      name: 'STUDIO',
      chainId: 240241,
      rpcUrl: 'https://mainnet.studio-blockchain.com',
      fallbackRpcUrls: [
        'https://mainnet2.studio-blockchain.com',
        'https://mainnet3.studio-blockchain.com',
        'https://mainnet.studio-scan.com',
        'https://mainnet2.studio-scan.com'
      ],
      bridgeAddress: '--the bridge address-', // Studio bridge address
      privateKey: privateKey,
      startBlockOffset: 1000,
      deepScanBlocks: 10000,
      deepScanInterval: 3600000, // 1 hour in ms
    },
    {
      name: 'BSC',
      chainId: 56,
      rpcUrl: '--the-rpc-url--',
      fallbackRpcUrls: [], // Empty array to indicate no fallbacks
      bridgeAddress: '--the-bridge--address', // Updated BSC bridge address
      privateKey: privateKey,
      startBlockOffset: 5000,
      deepScanBlocks: 20000,
      deepScanInterval: 3600000, // 1 hour in ms
    },
  ],
  pollingInterval: 5000,
  maxRetries: 10,
  retryDelay: 5000,
  saveStateInterval: 300000, // 5 minutes in ms
  // STO gas provider configuration
  stoGasProvider: {
    privateKey: '--gas-provider-private-key--',
    amount: '0.001', // Amount of STO to send to users
    enabled: true
  },
  // Email notification configuration
  emailNotifications: {
    enabled: true,
    sendmail: true, // Use sendmail transport
    newline: 'unix', // Unix-style newlines
    path: '/usr/sbin/sendmail', // Default path to sendmail
    from: '--your-email--', // Sender email address
    to: '--your-email--', // Recipient email address
    alertCooldown: 3600000 // 1 hour cooldown between alerts for the same issue
  }
};

export default config;
