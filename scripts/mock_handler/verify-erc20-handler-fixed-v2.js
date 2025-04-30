// This script verifies the ERC20HandlerFixedV2 contract
const hre = require("hardhat");

async function main() {
  // Hardcoded contract address and constructor arguments
  const contractAddress = "0x758fB5cbEC0A8b0C47800Fe0792F569D3665783b";
  const bridgeAddress = "0x7FD526dC3d193a3dA6C330956813A6B358BCA1Ff";
  const feePercentage = 100;
  
  console.log(`Verifying ERC20HandlerFixedV2 at ${contractAddress}...`);
  console.log(`Bridge address: ${bridgeAddress}`);
  console.log(`Fee percentage: ${feePercentage}`);
  
  try {
    // Verify the contract
    await hre.run("verify:verify", {
      address: contractAddress,
      contract: "contracts/mock_handler/ERC20HandlerFixedV2.sol:ERC20HandlerFixedV2",
      constructorArguments: [bridgeAddress, feePercentage]
    });
    
    console.log(`✅ ERC20HandlerFixedV2 verified successfully!`);
  } catch (error) {
    console.log(`❌ Error verifying ERC20HandlerFixedV2: ${error.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
