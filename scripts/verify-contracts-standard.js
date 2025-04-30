const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load deployment info
const STUDIO_DEPLOYMENT_PATH = path.resolve(__dirname, '../studio-deployment.json');
const PRESALE_DEPLOYMENT_PATH = path.resolve(__dirname, '../presale-deployment.json');

const studioDeploymentData = JSON.parse(fs.readFileSync(STUDIO_DEPLOYMENT_PATH, 'utf8'));
const presaleDeploymentData = JSON.parse(fs.readFileSync(PRESALE_DEPLOYMENT_PATH, 'utf8'));

// Function to execute a command and log the output
function runCommand(command) {
  console.log(`Executing: ${command}`);
  try {
    const output = execSync(command, { encoding: 'utf8' });
    console.log(output);
    return true;
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return false;
  }
}

// Function to verify a contract
async function verifyContract(contractName, address, constructorArgs = []) {
  console.log(`\nVerifying ${contractName} at ${address}...`);
  
  // Convert constructor args to string
  const argsString = constructorArgs.length > 0 ? ' ' + constructorArgs.join(' ') : '';
  
  // Build the verification command
  const command = `npx hardhat verify --network studio ${address}${argsString}`;
  
  // Run the command
  return runCommand(command);
}

// Main function
async function main() {
  console.log('Starting contract verification process...');
  
  // Verify RateLimiter contract
  await verifyContract(
    'RateLimiter',
    studioDeploymentData.rateLimiter
  );
  
  // Verify Bridge contract
  await verifyContract(
    'Bridge',
    studioDeploymentData.bridge,
    [
      240241, // Chain ID
      ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"], // Initial relayers
      1 // Relayer threshold
    ]
  );
  
  // Verify ERC20HandlerFixed contract
  await verifyContract(
    'ERC20HandlerFixed',
    studioDeploymentData.erc20HandlerFixed,
    [
      studioDeploymentData.bridge, // Bridge address
      100 // Fee percentage (1%)
    ]
  );
  
  // Verify NativeHandler contract
  await verifyContract(
    'NativeHandler',
    studioDeploymentData.nativeHandler,
    [
      studioDeploymentData.bridge, // Bridge address
      100 // Fee percentage (1%)
    ]
  );
  
  // Verify StudioPresale contract
  await verifyContract(
    'StudioPresale',
    presaleDeploymentData.presale,
    [
      presaleDeploymentData.usdt, // USDT token address
      presaleDeploymentData.baseTokenPrice, // Base token price
      presaleDeploymentData.minPurchaseAmount, // Minimum purchase amount
      presaleDeploymentData.targetRaiseAmount, // Target raise amount
      presaleDeploymentData.totalTokensAllocated // Total tokens allocated
    ]
  );
  
  // Verify STORecovery contract
  await verifyContract(
    'STORecovery',
    presaleDeploymentData.recovery
  );
  
  console.log('\nContract verification process completed!');
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
