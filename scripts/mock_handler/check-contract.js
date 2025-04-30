// This script checks if a contract exists at a specific address
const hre = require("hardhat");

async function main() {
  try {
    // Hardcoded contract address
    const contractAddress = "0x758fB5cbEC0A8b0C47800Fe0792F569D3665783b";
    
    console.log(`Checking if contract exists at ${contractAddress}...`);
    
    // Get the provider
    const provider = hre.ethers.provider;
    
    // Get the code at the address
    const code = await provider.getCode(contractAddress);
    
    if (code === '0x') {
      console.log(`No contract found at ${contractAddress}. The contract may not have been deployed yet.`);
    } else {
      console.log(`Contract found at ${contractAddress}!`);
      console.log(`Code length: ${(code.length - 2) / 2} bytes`);
      
      // Try to interact with the contract
      console.log(`\nTrying to interact with the contract...`);
      
      // Get the contract factory
      const ERC20HandlerFixedV2 = await hre.ethers.getContractFactory("ERC20HandlerFixedV2");
      
      // Attach to the contract
      const contract = ERC20HandlerFixedV2.attach(contractAddress);
      
      try {
        // Try to call a view function
        const bridgeAddress = await contract._bridgeAddress();
        console.log(`Bridge address: ${bridgeAddress}`);
        
        // If we get here, the contract is working
        console.log(`\nContract is working!`);
      } catch (error) {
        console.log(`Failed to interact with the contract: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error("Error checking contract:", error);
    process.exit(1);
  }
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
