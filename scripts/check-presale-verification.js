const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load deployment info
const PRESALE_DEPLOYMENT_PATH = path.resolve(__dirname, '../presale-deployment.json');
const presaleDeploymentData = JSON.parse(fs.readFileSync(PRESALE_DEPLOYMENT_PATH, 'utf8'));

// Contract addresses
const presaleAddress = presaleDeploymentData.presale;
const recoveryAddress = presaleDeploymentData.recovery;

// Function to check if a contract is verified
async function isContractVerified(address) {
  try {
    const response = await axios.get(`https://mainnetindexer.studio-blockchain.com/contracts/${address}/verified`);
    return response.data.verified;
  } catch (error) {
    console.error(`Error checking if contract ${address} is verified:`, error.response ? error.response.data : error.message);
    return false;
  }
}

// Main function
async function main() {
  // Check if presale contract is verified
  console.log(`Checking if presale contract at ${presaleAddress} is verified...`);
  const isPresaleVerified = await isContractVerified(presaleAddress);
  console.log(`Presale contract is ${isPresaleVerified ? 'verified' : 'not verified'}`);
  
  // Check if recovery contract is verified
  console.log(`\nChecking if recovery contract at ${recoveryAddress} is verified...`);
  const isRecoveryVerified = await isContractVerified(recoveryAddress);
  console.log(`Recovery contract is ${isRecoveryVerified ? 'verified' : 'not verified'}`);
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
