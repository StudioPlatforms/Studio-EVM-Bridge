# Withdraw Bridge Fees Script

This script allows the bridge owner to withdraw accumulated USDT fees from the BSC bridge contract.

## Prerequisites

1. You must have the private key of the bridge owner configured in your Hardhat environment
2. You must have the necessary dependencies installed:
   ```
   npm install
   ```

## How to Run

Execute the script using Hardhat with the BSC network configuration:

```bash
npx hardhat run scripts/withdraw-bridge-fees.js --network bsc
```

## What the Script Does

1. Connects to the BSC network
2. Loads the bridge contract at address specified in `bsc-deployment.json`
3. Checks if the caller is the owner of the bridge
4. Gets the USDT balance of the bridge contract
5. Asks for confirmation before withdrawing
6. Calls the `adminWithdraw` function to withdraw the USDT to the owner's address
7. Confirms the transaction and displays the owner's new USDT balance

## Important Notes

- This script can only be run by the bridge owner
- The script will withdraw the entire USDT balance from the bridge contract
- Make sure you have enough BNB to cover the transaction gas fees
- The script requires confirmation before executing the withdrawal

## Example Output

```
Bridge address: 0x1806d6109E9898A57e1Df9852A05B6d03Fc85Ffd
USDT address: 0x55d398326f99059fF775485246999027B3197955
Owner address: 0x...
Bridge USDT balance: 1000.00 USDT
Do you want to withdraw 1000.00 USDT to 0x...? (y/n) y
Withdrawing 1000.00 USDT from bridge to 0x...
Transaction hash: 0x...
Waiting for transaction confirmation...
Successfully withdrawn 1000.00 USDT to 0x...
Owner's USDT balance: 1000.00 USDT
```

## Troubleshooting

If you encounter an error like:
```
Error: The caller (0x...) is not the owner of the bridge (0x...)
You must use the owner's private key to run this script
```

Make sure you are using the correct private key for the bridge owner in your Hardhat configuration.
