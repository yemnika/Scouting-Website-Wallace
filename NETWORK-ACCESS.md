# Making Your Server Accessible from Other Networks

There are several ways to make your FRC Scouting app accessible from the internet:

## Option 1: ngrok (Easiest - For Testing)

**ngrok** creates a secure tunnel to your local server, giving you a public URL.

### Setup:

1. **Install ngrok:**
   - Download from: https://ngrok.com/download
   - Extract the executable
   - Add to your PATH, or place in your project folder

2. **Start your server:**
   ```bash
   npm start
   ```

3. **In a new terminal, start ngrok:**
   ```bash
   ngrok http 3000
   ```
   
   Or use the helper script:
   ```bash
   npm run tunnel
   ```

4. **Copy the forwarding URL:**
   - ngrok will show a URL like: `https://abc123.ngrok.io`
   - Share this URL with anyone - it will work from anywhere!

**Note:** Free ngrok URLs change each time you restart. For a permanent URL, sign up for a free ngrok account.

---

## Option 2: Port Forwarding (Permanent Solution)

This makes your server accessible via your public IP address.

### Steps:

1. **Find your public IP:**
   - Visit: https://whatismyipaddress.com
   - Or run: `curl ifconfig.me` (in PowerShell: `Invoke-WebRequest -Uri ifconfig.me -UseBasicParsing | Select-Object -ExpandProperty Content`)

2. **Configure your router:**
   - Log into your router admin panel (usually `192.168.1.1` or `192.168.0.1`)
   - Find "Port Forwarding" or "Virtual Server" settings
   - Add a rule:
     - **External Port:** 3000 (or any port you prefer)
     - **Internal IP:** Your computer's local IP (from `npm run get-ip`)
     - **Internal Port:** 3000
     - **Protocol:** TCP
   - Save and apply

3. **Configure Windows Firewall:**
   - Allow port 3000 through Windows Firewall
   - Or allow Node.js for all networks

4. **Access your server:**
   - Others can access: `http://YOUR_PUBLIC_IP:3000`
   - Example: `http://123.45.67.89:3000`

**Security Note:** Exposing your server to the internet has security risks. Consider:
- Adding authentication
- Using HTTPS
- Limiting access to specific IPs
- Using a reverse proxy (nginx)

---

## Option 3: Cloud Deployment (Production)

For a permanent, reliable solution, deploy to a cloud service:

### Free Options:

1. **Heroku:**
   ```bash
   # Install Heroku CLI, then:
   heroku create your-app-name
   git push heroku main
   ```

2. **Railway:**
   - Connect your GitHub repo
   - Auto-deploys on push

3. **Render:**
   - Connect GitHub repo
   - Free tier available

4. **Glitch:**
   - Import from GitHub
   - Instant deployment

### Paid Options (More reliable):

- AWS EC2
- DigitalOcean
- Azure
- Google Cloud Platform

---

## Quick Comparison

| Method | Setup Time | Cost | Permanent URL | Best For |
|--------|-----------|------|---------------|----------|
| ngrok | 2 minutes | Free | No (free tier) | Testing |
| Port Forwarding | 10 minutes | Free | Yes | Home use |
| Cloud Deploy | 30+ minutes | Free/Paid | Yes | Production |

---

## Security Recommendations

If exposing to the internet:

1. **Add authentication:**
   - Username/password protection
   - API keys for access

2. **Use HTTPS:**
   - Get SSL certificate (Let's Encrypt is free)
   - Use reverse proxy (nginx, Caddy)

3. **Limit access:**
   - IP whitelisting
   - Rate limiting

4. **Keep updated:**
   - Update dependencies regularly
   - Monitor for vulnerabilities

---

## Testing External Access

Once set up, test from:
- Your phone (on mobile data, not WiFi)
- A friend's computer
- Online tools like: https://www.yougetsignal.com/tools/open-ports/

