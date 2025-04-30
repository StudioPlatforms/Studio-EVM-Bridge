const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const STUDIO_RPC_URL = process.env.STUDIO_RPC_URL || 'https://mainnet.studio-blockchain.com';
const BSC_RPC_URL = process.env.BSC_RPC_URL || 'https://rpc.ankr.com/bsc/3082a5ba432ea23043a6271d6a8eb964d141ceb87a8dff18dbaf13767346435c';
const PRIVATE_KEY = '86d120d242ea32fa4ac72d9b2147ba3cd871158ed5f8353e98838bc13d24fcee'; // Owner private key
const OWNER_ADDRESS = '0x846C234adc6D8E74353c0c355b0c2B6a1e46634f'; // Owner address

// Minimal ABIs for verification
const BridgeABI = [
  'function _chainID() view returns (uint256)',
  'function isRelayer(address) view returns (bool)',
  'function _resourceIDToHandlerAddress(bytes32) view returns (address)',
  'function owner() view returns (address)'
];

const HandlerABI = [
  'function _bridgeAddress() view returns (address)',
  'function _resourceIDToTokenContractAddress(bytes32) view returns (address)',
  'function _contractWhitelist(address) view returns (bool)',
  'function thisChainID() view returns (uint256)'
];

const ERC20ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// Function to verify the deployment
async function verifyDeployment() {
  console.log('Verifying deployment...');
  
  try {
    // Load deployment files
    const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
    const bscDeploymentPath = path.resolve(__dirname, '../bsc-deployment.json');
    
    const studioDeployment = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
    const bscDeployment = JSON.parse(fs.readFileSync(bscDeploymentPath, 'utf8'));
    
    // Create providers
    const studioProvider = new ethers.JsonRpcProvider(STUDIO_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    
    // Verify Studio Bridge
    console.log('\nVerifying Studio Bridge...');
    const studioBridge = new ethers.Contract(studioDeployment.bridge, BridgeABI, studioProvider);
    
    const studioChainID = await studioBridge._chainID();
    console.log(`Studio Chain ID: ${studioChainID}`);
    console.log(`Expected Chain ID: ${studioDeployment.chainId}`);
    
    if (studioChainID !== BigInt(studioDeployment.chainId)) {
      console.warn(`⚠️ Chain ID mismatch: ${studioChainID} !== ${studioDeployment.chainId}`);
    } else {
      console.log('✅ Chain ID matches');
    }
    
    // Verify relayer registration
    const relayerAddress = '0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7';
    const isRelayer = await studioBridge.isRelayer(relayerAddress);
    console.log(`Is relayer registered: ${isRelayer}`);
    
    if (!isRelayer) {
      console.error('❌ Relayer is not registered on Studio Bridge');
    } else {
      console.log('✅ Relayer is registered');
    }
    
    // Verify resource mappings
    console.log('\nVerifying resource mappings...');
    
    // USDT resource
    const usdtResourceID = studioDeployment.resources.usdt.resourceID;
    const usdtHandlerAddress = await studioBridge._resourceIDToHandlerAddress(usdtResourceID);
    console.log(`USDT Handler Address: ${usdtHandlerAddress}`);
    console.log(`Expected: ${studioDeployment.erc20HandlerFixed}`);
    
    if (usdtHandlerAddress.toLowerCase() !== studioDeployment.erc20HandlerFixed.toLowerCase()) {
      console.error('❌ USDT Handler address mismatch');
    } else {
      console.log('✅ USDT Handler address matches');
    }
    
    // Native resource
    const nativeResourceID = studioDeployment.resources.native.resourceID;
    const nativeHandlerAddress = await studioBridge._resourceIDToHandlerAddress(nativeResourceID);
    console.log(`Native Handler Address: ${nativeHandlerAddress}`);
    console.log(`Expected: ${studioDeployment.nativeHandler}`);
    
    if (nativeHandlerAddress.toLowerCase() !== studioDeployment.nativeHandler.toLowerCase()) {
      console.error('❌ Native Handler address mismatch');
    } else {
      console.log('✅ Native Handler address matches');
    }
    
    // Verify ERC20 Handler
    console.log('\nVerifying ERC20 Handler...');
    const erc20Handler = new ethers.Contract(studioDeployment.erc20HandlerFixed, HandlerABI, studioProvider);
    
    const handlerBridgeAddress = await erc20Handler._bridgeAddress();
    console.log(`Handler's Bridge Address: ${handlerBridgeAddress}`);
    console.log(`Expected: ${studioDeployment.bridge}`);
    
    if (handlerBridgeAddress.toLowerCase() !== studioDeployment.bridge.toLowerCase()) {
      console.error('❌ Handler\'s Bridge address mismatch');
    } else {
      console.log('✅ Handler\'s Bridge address matches');
    }
    
    // Verify token mapping
    const handlerTokenAddress = await erc20Handler._resourceIDToTokenContractAddress(usdtResourceID);
    console.log(`Handler's USDT Address: ${handlerTokenAddress}`);
    console.log(`Expected: ${studioDeployment.resources.usdt.tokenAddress}`);
    
    if (handlerTokenAddress.toLowerCase() !== studioDeployment.resources.usdt.tokenAddress.toLowerCase()) {
      console.error('❌ Handler\'s USDT address mismatch');
    } else {
      console.log('✅ Handler\'s USDT address matches');
    }
    
    // Verify token whitelist
    const isWhitelisted = await erc20Handler._contractWhitelist(studioDeployment.resources.usdt.tokenAddress);
    console.log(`Is USDT whitelisted: ${isWhitelisted}`);
    
    if (!isWhitelisted) {
      console.error('❌ USDT is not whitelisted');
    } else {
      console.log('✅ USDT is whitelisted');
    }
    
    // Verify handler chain ID
    const handlerChainID = await erc20Handler.thisChainID();
    console.log(`Handler Chain ID: ${handlerChainID}`);
    console.log(`Expected Chain ID: ${studioDeployment.chainId}`);
    
    if (handlerChainID !== BigInt(studioDeployment.chainId)) {
      console.warn(`⚠️ Handler Chain ID mismatch: ${handlerChainID} !== ${studioDeployment.chainId}`);
    } else {
      console.log('✅ Handler Chain ID matches');
    }
    
    // Verify USDT token
    console.log('\nVerifying USDT token...');
    const usdtContract = new ethers.Contract(studioDeployment.resources.usdt.tokenAddress, ERC20ABI, studioProvider);
    
    try {
      const decimals = await usdtContract.decimals();
      const symbol = await usdtContract.symbol();
      
      console.log(`USDT Symbol: ${symbol}`);
      console.log(`USDT Decimals: ${decimals}`);
      
      console.log('✅ USDT token is accessible');
    } catch (error) {
      console.error('❌ Error accessing USDT token:', error.message);
    }
    
    // Verify relayer configuration
    console.log('\nVerifying relayer configuration...');
    
    // Read the multichain.config.ts file
    const configPath = path.resolve(__dirname, '../multichain.config.ts');
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Check if the Studio bridge address is correctly set in the config
    if (configContent.includes(studioDeployment.bridge)) {
      console.log('✅ Studio bridge address is correctly set in relayer config');
    } else {
      console.error('❌ Studio bridge address is not correctly set in relayer config');
    }
    
    // Check if the BSC bridge address is correctly set in the config
    if (configContent.includes(bscDeployment.bridge)) {
      console.log('✅ BSC bridge address is correctly set in relayer config');
    } else {
      console.error('❌ BSC bridge address is not correctly set in relayer config');
    }
    
    // Verify resource IDs match between chains
    console.log('\nVerifying resource IDs match between chains...');
    
    if (studioDeployment.resources.usdt.resourceID === bscDeployment.resources.usdt.resourceID) {
      console.log('✅ USDT resource ID matches between chains');
    } else {
      console.error('❌ USDT resource ID mismatch between chains');
      console.log(`Studio: ${studioDeployment.resources.usdt.resourceID}`);
      console.log(`BSC: ${bscDeployment.resources.usdt.resourceID}`);
    }
    
    if (studioDeployment.resources.native.resourceID === bscDeployment.resources.native.resourceID) {
      console.log('✅ Native resource ID matches between chains');
    } else {
      console.error('❌ Native resource ID mismatch between chains');
      console.log(`Studio: ${studioDeployment.resources.native.resourceID}`);
      console.log(`BSC: ${bscDeployment.resources.native.resourceID}`);
    }
    
    if (studioDeployment.resources.bnb.resourceID === bscDeployment.resources.bnb.resourceID) {
      console.log('✅ BNB resource ID matches between chains');
    } else {
      console.error('❌ BNB resource ID mismatch between chains');
      console.log(`Studio: ${studioDeployment.resources.bnb.resourceID}`);
      console.log(`BSC: ${bscDeployment.resources.bnb.resourceID}`);
    }
    
    console.log('\nVerification completed');
    
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

// Execute the function
verifyDeployment();
