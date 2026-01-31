// Helper script to get public IP and provide port forwarding instructions
const os = require('os');
const https = require('https');
const http = require('http');

console.log('\n=== Port Forwarding Setup Guide ===\n');

// Get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

// Get public IP
console.log('Getting your public IP address...\n');

const services = [
  { url: 'https://api.ipify.org?format=json', name: 'ipify' },
  { url: 'https://ifconfig.me/ip', name: 'ifconfig.me', text: true },
  { url: 'https://api.myip.com', name: 'myip.com' }
];

let attempts = 0;
const maxAttempts = services.length;

function tryGetIP(index) {
  if (index >= services.length) {
    console.log('❌ Could not get public IP automatically.');
    console.log('Visit https://whatismyipaddress.com to find your public IP.\n');
    showInstructions(null);
    return;
  }

  const service = services[index];
  const url = new URL(service.url);
  const protocol = url.protocol === 'https:' ? https : http;
  
  const req = protocol.get(service.url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        let publicIP;
        if (service.text) {
          publicIP = data.trim();
        } else {
          const json = JSON.parse(data);
          publicIP = json.ip || json.query || json.IPv4;
        }
        
        if (publicIP && /^\d+\.\d+\.\d+\.\d+$/.test(publicIP)) {
          console.log(`✅ Your Public IP: ${publicIP}\n`);
          showInstructions(publicIP);
        } else {
          tryGetIP(index + 1);
        }
      } catch (e) {
        tryGetIP(index + 1);
      }
    });
  });
  
  req.on('error', () => {
    tryGetIP(index + 1);
  });
  
  req.setTimeout(5000, () => {
    req.destroy();
    tryGetIP(index + 1);
  });
}

function showInstructions(publicIP) {
  console.log('=== Port Forwarding Instructions ===\n');
  console.log(`Your Local IP: ${localIP}`);
  if (publicIP) {
    console.log(`Your Public IP: ${publicIP}\n`);
  }
  console.log('Follow these steps:\n');
  console.log('1. Log into your router:');
  console.log('   - Usually: http://192.168.1.1 or http://192.168.0.1');
  console.log('   - Check router label for default IP/credentials\n');
  console.log('2. Find Port Forwarding settings:');
  console.log('   - Look for: "Port Forwarding", "Virtual Server", "NAT", or "Firewall"');
  console.log('   - May be under: Advanced → Port Forwarding\n');
  console.log('3. Add a new port forwarding rule:');
  console.log('   - Service Name: FRC Scouting (or any name)');
  console.log('   - External Port: 3000');
  console.log('   - Internal IP: ' + localIP);
  console.log('   - Internal Port: 3000');
  console.log('   - Protocol: TCP (or Both)');
  console.log('   - Save/Apply the rule\n');
  console.log('4. Configure Windows Firewall:');
  console.log('   - Windows Defender Firewall → Advanced Settings');
  console.log('   - Inbound Rules → New Rule');
  console.log('   - Port → TCP → Specific: 3000');
  console.log('   - Allow connection → Apply to all profiles');
  console.log('   - Name: "FRC Scouting Server"\n');
  console.log('5. Test access:');
  if (publicIP) {
    console.log(`   - From another network: http://${publicIP}:3000`);
  } else {
    console.log('   - From another network: http://YOUR_PUBLIC_IP:3000');
  }
  console.log('   - Use your phone on mobile data (not WiFi) to test\n');
  console.log('⚠️  Security Note:');
  console.log('   - Your server will be accessible from the internet');
  console.log('   - Consider adding authentication for production use');
  console.log('   - Keep your server and dependencies updated\n');
}

tryGetIP(0);

