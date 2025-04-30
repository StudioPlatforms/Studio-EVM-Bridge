const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = '86d120d242ea32fa4ac72d9b2147ba3cd871158ed5f8353e98838bc13d24fcee'; // Owner private key
const OWNER_ADDRESS = '0x846C234adc6D8E74353c0c355b0c2B6a1e46634f'; // Owner address

// Function to update the relayer configuration
async function updateRelayerConfig() {
  console.log('Updating relayer configuration...');
  
  try {
    // Read the studio-deployment.json file to get the new bridge address
    const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
    const studioDeployment = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
    
    // Get the new bridge address
    const newBridgeAddress = studioDeployment.bridge;
    
    if (!newBridgeAddress) {
      throw new Error('Bridge address not found in studio-deployment.json');
    }
    
    console.log(`New Studio bridge address: ${newBridgeAddress}`);
    
    // Read the current multichain.config.ts file
    const configPath = path.resolve(__dirname, '../multichain.config.ts');
    let configContent = fs.readFileSync(configPath, 'utf8');
    
    // Update the Studio bridge address in the configuration
    // We need to find the STUDIO chain configuration and update the bridgeAddress
    const studioChainRegex = /({\s*name:\s*['"]STUDIO['"],[\s\S]*?bridgeAddress:\s*['"])([^'"]*?)(['"])/;
    
    if (!studioChainRegex.test(configContent)) {
      throw new Error('Could not find STUDIO chain configuration in multichain.config.ts');
    }
    
    // Replace the bridge address
    const updatedContent = configContent.replace(
      studioChainRegex,
      `$1${newBridgeAddress}$3`
    );
    
    // Write the updated configuration back to the file
    fs.writeFileSync(configPath, updatedContent);
    
    console.log('Relayer configuration updated successfully');
    console.log(`Updated Studio bridge address to: ${newBridgeAddress}`);
    
    // Also update the .env file if it exists
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update the SOURCE_BRIDGE_ADDRESS in the .env file
      const sourceBridgeRegex = /(SOURCE_BRIDGE_ADDRESS=)([^\n]*)/;
      
      if (sourceBridgeRegex.test(envContent)) {
        const updatedEnvContent = envContent.replace(
          sourceBridgeRegex,
          `$1${newBridgeAddress}`
        );
        
        fs.writeFileSync(envPath, updatedEnvContent);
        console.log(`Updated SOURCE_BRIDGE_ADDRESS in .env file to: ${newBridgeAddress}`);
      }
    }
    
  } catch (error) {
    console.error('Error updating relayer configuration:', error);
    process.exit(1);
  }
}

// Execute the function
updateRelayerConfig();
