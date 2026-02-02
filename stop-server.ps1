# Script to stop server on port 3000

Write-Host "Finding process on port 3000..." -ForegroundColor Yellow

# Find Node.js processes using port 3000
$connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    
    foreach ($pid in $pids) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Stopping process: $($process.ProcessName) (PID: $pid)" -ForegroundColor Red
            Stop-Process -Id $pid -Force
            Write-Host "✓ Process stopped" -ForegroundColor Green
        }
    }
} else {
    Write-Host "No process found on port 3000" -ForegroundColor Yellow
}

# Also check for node processes
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "`nFound Node.js processes:" -ForegroundColor Yellow
    $nodeProcesses | Format-Table Id, ProcessName, StartTime
    Write-Host "To stop all Node.js processes, run:" -ForegroundColor Cyan
    Write-Host "Get-Process node | Stop-Process -Force" -ForegroundColor White
}

