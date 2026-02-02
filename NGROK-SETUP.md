# ngrok Setup Guide

ngrok creates a secure tunnel to your local server, giving you a public URL that works from anywhere - no port forwarding needed!

## Quick Setup (2 Methods)

### Method 1: Using ngrok Executable (Recommended)

#### Step 1: Install ngrok

**Option A: Download (Easiest)**
1. Go to: https://ngrok.com/download
2. Download for Windows
3. Extract `ngrok.exe` to a folder (e.g., `C:\ngrok\`)
4. Add to PATH, OR place `ngrok.exe` in your project folder

**Option B: Using npm (Alternative)**
```bash
npm install -g ngrok
```

#### Step 2: Sign up for free account (Optional but recommended)
1. Go to: https://dashboard.ngrok.com/signup
2. Create free account
3. Get your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken
4. Run: `ngrok config add-authtoken YOUR_TOKEN`

**Why sign up?**
- Free accounts get longer URLs that don't change
- Better for sharing with your team
- More reliable connections

#### Step 3: Start your server
```bash
npm start
```
Keep this terminal open!

#### Step 4: Start ngrok tunnel

**In a NEW terminal window:**
```bash
ngrok http 3000
```

Or use the helper script:
```bash
npm run tunnel
```

#### Step 5: Copy your public URL

ngrok will show something like:
```
Forwarding   https://abc123.ngrok.io -> http://localhost:3000
```

**Share this URL** (`https://abc123.ngrok.io`) with anyone - it works from anywhere!

---

### Method 2: Using ngrok npm Package (No separate install needed)

#### Step 1: Install ngrok package
```bash
npm install ngrok --save-dev
```

#### Step 2: Start server with ngrok
```bash
npm run start-ngrok
```

This automatically starts both the server and ngrok tunnel!

---

## Usage Tips

### Keep Both Running
- **Terminal 1:** Your server (`npm start`)
- **Terminal 2:** ngrok tunnel (`ngrok http 3000`)

### Getting Your URL
- Look for the "Forwarding" line in ngrok output
- Or visit: http://localhost:4040 (ngrok web interface)

### Free Account Benefits
- **Without account:** URL changes every time you restart
- **With account:** Get a fixed subdomain (e.g., `yourname.ngrok.io`)

### Stopping
- Press `Ctrl+C` in the ngrok terminal
- The tunnel closes immediately

---

## Troubleshooting

### "ngrok not found"
- Make sure ngrok.exe is in your PATH, or
- Place ngrok.exe in your project folder, or
- Use Method 2 (npm package)

### "Tunnel session failed"
- Make sure your server is running on port 3000
- Check Windows Firewall isn't blocking ngrok
- Try restarting ngrok

### URL not working
- Make sure both server AND ngrok are running
- Check the ngrok URL matches what you're using
- Try the ngrok web interface: http://localhost:4040

### Want a permanent URL?
- Sign up for free ngrok account
- Configure authtoken: `ngrok config add-authtoken YOUR_TOKEN`
- Use reserved domain (paid feature) or accept changing URLs

---

## Quick Reference

```bash
# Start server
npm start

# Start ngrok (in separate terminal)
ngrok http 3000

# Or use helper
npm run tunnel
```

**Your public URL will be shown in the ngrok output!**

