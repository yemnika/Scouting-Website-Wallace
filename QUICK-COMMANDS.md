# Quick Commands Reference

## Stop Server on Port 3000

### PowerShell (Recommended)
```powershell
# One-liner to stop process on port 3000
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Or use the script:
```powershell
.\stop-server.ps1
```

### Alternative: Stop all Node.js processes
```powershell
Get-Process node | Stop-Process -Force
```

### Find what's using port 3000 first:
```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object LocalAddress, LocalPort, State, OwningProcess
```

### Using Command Prompt (cmd):
```cmd
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

---

## Start Server

```bash
npm start
```

## Start with ngrok

```bash
npm run start-ngrok
```

## Get IP Address

```bash
npm run get-ip
```

---

## Common Issues

### Port 3000 already in use
1. Find the process: `Get-NetTCPConnection -LocalPort 3000`
2. Stop it: Use commands above
3. Or change port in `server.js` (line 10: `const PORT = 3000;`)

### Can't stop process
- Run PowerShell as Administrator
- Or use Task Manager → Find Node.js → End Task

