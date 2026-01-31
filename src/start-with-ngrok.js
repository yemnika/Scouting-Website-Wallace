// Start server and ngrok tunnel together
const { spawn } = require('child_process');
const ngrok = require('ngrok');

const PORT = 3000;

console.log('\n=== Starting FRC Scouting Server with ngrok ===\n');

// Start the server
console.log('Starting server on port', PORT, '...\n');
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  shell: true
});

// Wait a bit for server to start, then start ngrok
setTimeout(async () => {
  try {
    console.log('\n=== Starting ngrok tunnel ===\n');
    // Try to get authtoken from environment or config
    const authtoken = process.env.NGROK_AUTHTOKEN || 
                     (require('fs').existsSync(require('path').join(require('os').homedir(), '.ngrok2', 'ngrok.yml')) 
                      ? null : null); // Will use config file if exists
    
    const connectOptions = { addr: PORT };
    if (authtoken) {
      connectOptions.authtoken = authtoken;
    }
    
    const url = await ngrok.connect(connectOptions);
    
    console.log('\n✅ ngrok tunnel active!');
    console.log(`\n🌐 Public URL: ${url}`);
    console.log(`\nShare this URL with anyone: ${url}`);
    console.log('\nPress Ctrl+C to stop both server and tunnel\n');
    
    // Also show ngrok web interface
    console.log('📊 ngrok web interface: http://localhost:4040\n');
    
  } catch (error) {
    console.error('\n❌ Error starting ngrok:', error.message);
    console.log('\nTrying alternative method...');
    console.log('Make sure ngrok is installed: npm install -g ngrok');
    console.log('Or download from: https://ngrok.com/download\n');
    
    // Fallback: try using ngrok executable
    const ngrokProcess = spawn('ngrok', ['http', PORT.toString()], {
      stdio: 'inherit',
      shell: true
    });
    
    ngrokProcess.on('error', (err) => {
      console.error('Could not start ngrok. Please install it manually.');
      console.log('Download from: https://ngrok.com/download');
    });
    
    process.on('SIGINT', () => {
      ngrokProcess.kill();
      server.kill();
      process.exit(0);
    });
  }
}, 2000);

// Handle cleanup
process.on('SIGINT', async () => {
  console.log('\n\nStopping server and ngrok...');
  try {
    await ngrok.kill();
  } catch (e) {
    // Ignore errors
  }
  server.kill();
  process.exit(0);
});

server.on('error', (error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});

