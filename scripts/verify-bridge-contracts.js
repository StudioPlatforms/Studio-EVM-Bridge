const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Load deployment info
  const studioDeploymentPath = path.resolve(__dirname, '../studio-deployment.json');
  const studioDeploymentData = JSON.parse(fs.readFileSync(studioDeploymentPath, 'utf8'));
  
  console.log("Verifying Studio bridge contracts...");
  
  // Verify RateLimiter contract
  console.log("\nVerifying RateLimiter contract...");
  try {
    await hre.run("verify:verify", {
      address: studioDeploymentData.rateLimiter,
      contract: "contracts/RateLimiter.sol:RateLimiter",
      constructorArguments: []
    });
    console.log(`✅ RateLimiter contract verified successfully at ${studioDeploymentData.rateLimiter}`);
  } catch (error) {
    console.log(`❌ Error verifying RateLimiter contract: ${error.message}`);
  }
  
  // Verify Bridge contract
  console.log("\nVerifying Bridge contract...");
  try {
    await hre.run("verify:verify", {
      address: studioDeploymentData.bridge,
      contract: "contracts/Bridge.sol:Bridge",
      constructorArguments: [
        240241, // Chain ID (hardcoded from studio-deployment.json)
        ["0xa4eAE86Bc4172FA68Dbf56140A3A7eb2FAdf53B7"], // Initial relayers
        1 // Relayer threshold
      ]
    });
    console.log(`✅ Bridge contract verified successfully at ${studioDeploymentData.bridge}`);
  } catch (error) {
    console.log(`❌ Error verifying Bridge contract: ${error.message}`);
  }
  
  // Verify ERC20HandlerFixed contract
  console.log("\nVerifying ERC20HandlerFixed contract...");
  try {
    await hre.run("verify:verify", {
      address: studioDeploymentData.erc20HandlerFixed,
      contract: "contracts/ERC20HandlerFixed.sol:ERC20HandlerFixed",
      constructorArguments: [
        studioDeploymentData.bridge, // Bridge address
        100 // Fee percentage (1%)
      ]
    });
    console.log(`✅ ERC20HandlerFixed contract verified successfully at ${studioDeploymentData.erc20HandlerFixed}`);
  } catch (error) {
    console.log(`❌ Error verifying ERC20HandlerFixed contract: ${error.message}`);
  }
  
  // Verify NativeHandler contract
  console.log("\nVerifying NativeHandler contract...");
  try {
    await hre.run("verify:verify", {
      address: studioDeploymentData.nativeHandler,
      contract: "contracts/NativeHandler.sol:NativeHandler",
      constructorArguments: [
        studioDeploymentData.bridge, // Bridge address
        100 // Fee percentage (1%)
      ]
    });
    console.log(`✅ NativeHandler contract verified successfully at ${studioDeploymentData.nativeHandler}`);
  } catch (error) {
    console.log(`❌ Error verifying NativeHandler contract: ${error.message}`);
  }
  
  console.log("\nBridge contract verification process completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
