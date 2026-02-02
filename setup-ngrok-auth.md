# ngrok Authentication Setup

ngrok requires a free account to use. Here's how to set it up:

## Step 1: Sign Up (Free)

1. Go to: **https://dashboard.ngrok.com/signup**
2. Sign up with email (or GitHub/Google)
3. Verify your email if needed

## Step 2: Get Your Authtoken

1. After signing in, go to: **https://dashboard.ngrok.com/get-started/your-authtoken**
2. Copy your authtoken (looks like: `2abc123def456ghi789jkl012mno345pq_6r7s8t9u0v1w2x3y4z5`)

## Step 3: Install Authtoken

### Option A: Using ngrok command (if installed)
```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### Option B: Set as environment variable
```powershell
$env:NGROK_AUTHTOKEN = "YOUR_AUTHTOKEN_HERE"
```

### Option C: Add to start-with-ngrok.js
Edit the file and replace the authtoken line.

## Step 4: Test

Run again:
```bash
npm run start-ngrok
```

It should work now!

---

## Quick Setup Script

I'll create a helper script to make this easier.

