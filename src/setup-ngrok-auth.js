// Helper script to set up ngrok authtoken
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n=== ngrok Authtoken Setup ===\n');
console.log('ngrok requires a free account to use.');
console.log('\nStep 1: Sign up at: https://dashboard.ngrok.com/signup');
console.log('Step 2: Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken\n');

rl.question('Paste your ngrok authtoken here: ', (authtoken) => {
  if (!authtoken || authtoken.trim().length === 0) {
    console.log('\n❌ No authtoken provided. Exiting.');
    rl.close();
    process.exit(1);
  }

  console.log('\nSetting up authtoken...\n');

  try {
    // Try using ngrok command if available
    try {
      execSync(`ngrok config add-authtoken ${authtoken.trim()}`, { stdio: 'inherit' });
      console.log('\n✅ Authtoken configured successfully!');
      console.log('\nYou can now run: npm run start-ngrok\n');
    } catch (error) {
      // If ngrok command not found, create config file manually
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      
      const ngrokConfigDir = path.join(os.homedir(), '.ngrok2');
      const ngrokConfigFile = path.join(ngrokConfigDir, 'ngrok.yml');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(ngrokConfigDir)) {
        fs.mkdirSync(ngrokConfigDir, { recursive: true });
      }
      
      // Write config file
      const config = `authtoken: ${authtoken.trim()}\n`;
      fs.writeFileSync(ngrokConfigFile, config);
      
      console.log('✅ Authtoken saved to config file!');
      console.log(`   Location: ${ngrokConfigFile}`);
      console.log('\nYou can now run: npm run start-ngrok\n');
    }
  } catch (error) {
    console.error('\n❌ Error setting up authtoken:', error.message);
    console.log('\nYou can manually set it by running:');
    console.log('ngrok config add-authtoken YOUR_AUTHTOKEN\n');
  }

  rl.close();
});

