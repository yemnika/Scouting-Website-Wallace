// Start server and ngrok tunnel together
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const DEFAULT_PORT = 3000;

// Find an available port (avoid EADDRINUSE if something is already on 3000)
function findAvailablePort(startPort, callback) {
  const server = net.createServer();
  server.listen(startPort, '0.0.0.0', () => {
    const port = server.address().port;
    server.close(() => callback(port));
  });
  server.on('error', () => findAvailablePort(startPort + 1, callback));
}

// Check if the ngrok package has a working binary (postinstall may not have run or may have failed)
const ngrokBinDir = path.join(__dirname, 'node_modules', 'ngrok', 'bin');
const ngrokExe = path.join(ngrokBinDir, process.platform === 'win32' ? 'ngrok.exe' : 'ngrok');
const hasBundledNgrok = fs.existsSync(ngrokExe);

console.log('\n=== Starting FRC Scouting Server with ngrok ===\n');

findAvailablePort(Number(process.env.PORT) || DEFAULT_PORT, (PORT) => {
  if (PORT !== DEFAULT_PORT) {
    console.log(`Port ${DEFAULT_PORT} in use, using port ${PORT} instead.\n`);
  }

  // Start the server with chosen port
  console.log('Starting server on port', PORT, '...\n');
  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: String(PORT) }
  });
  startNgrokAfterDelay(PORT, server);
});

function startNgrokAfterDelay(PORT, server) {
  let ngrokModule = null;

  process.on('SIGINT', async () => {
    console.log('\n\nStopping server and ngrok...');
    if (ngrokModule) {
      try {
        await ngrokModule.kill();
      } catch (e) { /* ignore */ }
    }
    server.kill();
    process.exit(0);
  });

  server.on('error', (error) => {
    console.error('Error starting server:', error);
    process.exit(1);
  });

  // Wait for server to start, then start ngrok
  setTimeout(async () => {
    if (!hasBundledNgrok) {
      console.log('\n=== Starting ngrok tunnel (using system ngrok) ===\n');
      console.log('Tip: Install ngrok from https://ngrok.com/download if needed.\n');
      const ngrokProcess = spawn('ngrok', ['http', PORT.toString()], {
        stdio: 'inherit',
        shell: true
      });
      ngrokProcess.on('error', (err) => {
        console.error('\n❌ Could not start ngrok:', err.message);
        console.log('Install: https://ngrok.com/download');
        console.log('Or run: node node_modules/ngrok/postinstall.js\n');
      });
      return;
    }

    try {
      ngrokModule = require('ngrok');
      console.log('\n=== Starting ngrok tunnel ===\n');
      const authtoken = process.env.NGROK_AUTHTOKEN;
      const connectOptions = { addr: PORT, proto: 'http' };
      if (authtoken) connectOptions.authtoken = authtoken;

      const url = await ngrokModule.connect(connectOptions);

      console.log('\n✅ ngrok tunnel active!');
      console.log(`\n🌐 Public URL: ${url}`);
      console.log(`\nShare this URL with anyone: ${url}`);
      console.log('\nPress Ctrl+C to stop both server and tunnel\n');
      console.log('📊 ngrok web interface: http://localhost:4040\n');
    } catch (error) {
      console.error('\n❌ Error starting ngrok:', error.message);
      console.log('\nTrying system ngrok...');
      const ngrokProcess = spawn('ngrok', ['http', PORT.toString()], {
        stdio: 'inherit',
        shell: true
      });
      ngrokProcess.on('error', () => {
        console.log('\nInstall ngrok: https://ngrok.com/download');
        console.log('Or run: node node_modules/ngrok/postinstall.js\n');
      });
    }
  }, 2000);
}

