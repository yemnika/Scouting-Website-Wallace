// Helper script to set up ngrok tunnel
const { spawn } = require('child_process');
const os = require('os');

console.log('\n=== Setting up ngrok tunnel ===\n');
console.log('This will create a public URL that anyone can access.\n');

// Check if ngrok is installed
const ngrokCheck = spawn('ngrok', ['version'], { shell: true });

ngrokCheck.on('error', (err) => {
  console.log('❌ ngrok is not installed or not in PATH');
  console.log('\nTo install ngrok:');
  console.log('1. Download from: https://ngrok.com/download');
  console.log('2. Extract and add to PATH, or');
  console.log('3. Use: npm install -g ngrok\n');
  console.log('Or run manually: ngrok http 3000\n');
  process.exit(1);
});

ngrokCheck.on('close', (code) => {
  if (code === 0) {
    console.log('✅ ngrok is installed');
    console.log('\nStarting ngrok tunnel on port 3000...\n');
    console.log('Press Ctrl+C to stop\n');
    
    const ngrok = spawn('ngrok', ['http', '3000'], { 
      shell: true,
      stdio: 'inherit'
    });
    
    ngrok.on('error', (err) => {
      console.error('Error starting ngrok:', err);
    });
    
    process.on('SIGINT', () => {
      console.log('\n\nStopping ngrok...');
      ngrok.kill();
      process.exit(0);
    });
  }
});

