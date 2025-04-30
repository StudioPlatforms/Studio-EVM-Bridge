const { execSync } = require('child_process');

// Server details
const SERVER = 'root@173.249.16.253';

// Function to execute SSH command
function executeSSH(command) {
  try {
    console.log(`Executing: ssh ${SERVER} "${command}"`);
    const output = execSync(`ssh ${SERVER} "${command}"`, { encoding: 'utf8' });
    console.log(output);
    return output;
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log('Checking relayer status before restart...');
    executeSSH('pm2 list | grep bridge-relayer');
    
    console.log('\nRestarting bridge relayer...');
    executeSSH('pm2 restart bridge-relayer');
    
    console.log('\nChecking relayer status after restart...');
    executeSSH('pm2 list | grep bridge-relayer');
    
    console.log('\nChecking recent logs...');
    executeSSH('pm2 logs bridge-relayer --lines 10 --nostream');
    
    console.log('\nBridge relayer has been restarted successfully.');
    console.log('The relayer should now be using the correct token decimals:');
    console.log('- BSC: 18 decimals');
    console.log('- Studio: 6 decimals');
  } catch (error) {
    console.error('Failed to restart bridge relayer:', error);
  }
}

// Execute main function
main();
