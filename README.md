# Studio Blockchain Bridge

A cross-chain bridge system that enables token transfers between BSC (Binance Smart Chain) and Studio blockchain.

## Overview

The Studio Blockchain Bridge is a secure and efficient solution for transferring tokens between BSC and Studio blockchain networks. It consists of smart contracts deployed on both chains and a relayer service that monitors for deposit events and executes proposals.

## Architecture

The bridge system consists of the following components:

1. **Bridge Contracts**: Main entry points for users, handling deposit events and proposal execution.
2. **Handler Contracts**:
   - **ERC20HandlerFixed**: Handles ERC20 token deposits and withdrawals
   - **NativeHandler**: Handles native token (BNB/STO) deposits and withdrawals
3. **Relayer Service**: A TypeScript application that monitors both chains for deposit events and executes proposals on the destination chain.

## Supported Tokens

The bridge currently supports the following tokens:

1. **USDT**
   - BSC: BEP20 USDT
   - Studio: Studio USDT

2. **USDC**
   - BSC: BEP20 USDC
   - Studio: Studio USDC

3. **3DC** (3D City)
   - BSC: BEP20 3DC
   - Studio: Studio 3DC

4. **Native Tokens** (BNB/STO)

## Bridge Flow

1. **Deposit Phase (Source Chain)**:
   - User approves the handler contract to spend their tokens (for ERC20 tokens)
   - User calls `deposit()` on the source chain's Bridge contract
   - The Bridge contract locks or burns tokens
   - A `Deposit` event is emitted

2. **Relay Phase**:
   - The relayer service monitors both chains for `Deposit` events
   - When a `Deposit` event is detected, the relayer calls `voteProposal()` on the destination chain's Bridge contract

3. **Execution Phase (Destination Chain)**:
   - Once enough relayers have voted, the proposal is executed
   - The Handler contract releases or mints tokens to the recipient

## Features

- **Fee System**: Configurable fee percentage with chain-specific and token-specific multipliers
- **Decimal Handling**: Automatic handling of tokens with different decimal places across chains
- **Rate Limiting**: Optional rate limiter to prevent excessive transfers
- **STO Gas Distribution**: Automatic distribution of STO for gas when bridging from BSC to Studio
- **Fallback RPC URLs**: Support for multiple RPC endpoints for resilience
- **Security Features**: Blacklisting, pausing, and reentrancy protection

## Prerequisites

- Node.js (v16+)
- npm or yarn
- Access to BSC and Studio blockchain RPC endpoints
- Private key for the relayer account (must be registered as a relayer on both bridge contracts)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/studio-blockchain/bridge.git
   cd bridge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your configuration:
   ```
   PRIVATE_KEY=your_private_key_here
   STUDIO_RPC_URL=https://mainnet2.studio-blockchain.com
   BSC_RPC_URL=https://bsc-dataseed.binance.org/
   STO_GAS_PROVIDER_KEY=your_sto_gas_provider_key_here
   EMAIL_FROM=your-email@example.com
   EMAIL_TO=recipient@example.com
   ```

## Deployment

### Smart Contracts

1. Deploy the Bridge contract:
   ```bash
   npx hardhat run scripts/deploy-studio-bridge.js --network studio
   npx hardhat run scripts/deploy-studio-bridge.js --network bsc
   ```

2. Register the relayer on both bridge contracts:
   ```bash
   npx hardhat run scripts/register-relayer-bsc.js --network bsc
   npx hardhat run scripts/register-relayer-studio.js --network studio
   ```

3. Verify the contracts on the respective block explorers:
   ```bash
   npx hardhat run scripts/verify-studio-bridge.js --network studio
   npx hardhat run scripts/verify-bridge-contracts.js --network bsc
   ```

### Relayer Service

1. Compile the TypeScript code:
   ```bash
   npx tsc multichain-relayer-fixed-nonce.ts --outDir dist --target ES2020 --module commonjs --esModuleInterop --skipLibCheck --resolveJsonModule
   ```

2. Start the relayer service:
   ```bash
   node dist/multichain-relayer-fixed-nonce.js
   ```

3. For production, use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

## Adding New Tokens

To add a new token to the bridge:

1. Generate a unique resource ID for the token
2. Set the resource ID in the Bridge and Handler contracts on both chains
3. Configure the token decimals on both chains

Example for adding a new token:
```bash
npx hardhat run scripts/add-new-token-to-bridge.js --network studio
npx hardhat run scripts/add-new-token-to-bridge.js --network bsc
```

## Monitoring

Monitor the bridge status using the provided scripts:

```bash
# Check bridge status
npx hardhat run scripts/check-bridge-status.js --network studio

# Check relayer balance
npx hardhat run scripts/check-relayer-balance.js --network bsc

# Check deposit events
npx hardhat run scripts/check-bsc-deposit-events.js --network bsc
```

## Troubleshooting

Common issues and solutions:

1. **Transaction Reverted on Destination Chain**:
   - Check token decimals configuration
   - Ensure relayer has enough gas
   - Verify resource ID mappings

2. **Relayer Not Processing Deposits**:
   - Check relayer service status
   - Verify relayer registration on both chains
   - Check RPC connectivity

3. **Incorrect Token Amounts**:
   - Verify token decimals configuration
   - Check fee percentage settings

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgements

- The Studio Blockchain team
- The Ethereum and Binance Smart Chain communities
