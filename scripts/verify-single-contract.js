const hre = require("hardhat");

async function main() {
  // Get contract address and name from command line arguments
  const contractAddress = process.argv[2];
  const contractName = process.argv[3];
  const constructorArgs = process.argv.slice(4);
  
  if (!contractAddress || !contractName) {
    console.error("Usage: npx hardhat run scripts/verify-single-contract.js --network studio <contractAddress> <contractName> [constructorArgs...]");
    process.exit(1);
  }
  
  console.log(`Verifying ${contractName} at ${contractAddress}...`);
  console.log("Constructor arguments:", constructorArgs);
  
  try {
    // Convert string arguments to appropriate types if needed
    const parsedArgs = constructorArgs.map(arg => {
      // Try to parse as number if it looks like a number
      if (/^\d+$/.test(arg)) {
        return parseInt(arg);
      }
      // Try to parse as array if it starts with [ and ends with ]
      if (arg.startsWith('[') && arg.endsWith(']')) {
        try {
          return JSON.parse(arg);
        } catch (e) {
          return arg;
        }
      }
      return arg;
    });
    
    // Verify the contract
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: parsedArgs
    });
    
    console.log(`✅ ${contractName} verified successfully!`);
  } catch (error) {
    console.log(`❌ Error verifying ${contractName}: ${error.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
