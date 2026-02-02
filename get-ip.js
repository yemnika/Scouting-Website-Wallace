// Quick script to get your local IP address
const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({
          interface: name,
          address: iface.address
        });
      }
    }
  }
  
  return ips;
}

const ips = getLocalIP();
console.log('\n=== Your Network IP Addresses ===\n');
if (ips.length === 0) {
  console.log('No network interfaces found. Make sure you are connected to a network.');
} else {
  ips.forEach(ip => {
    console.log(`${ip.interface}: http://${ip.address}:3000`);
  });
}
console.log('\nShare one of these addresses with others on your network.\n');
console.log('Note: Make sure Windows Firewall allows connections on port 3000.\n');

