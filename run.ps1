# Launches the SAR-Landslide-GenAI FastAPI backend + Next.js frontend together (Windows PowerShell).
# Usage: .\run.ps1   (Ctrl+C stops both)

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "No backend\.venv found. Create one first:"
    Write-Host "  py -m venv backend\.venv"
    Write-Host "  backend\.venv\Scripts\pip.exe install -r backend\requirements.txt"
    exit 1
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "frontend\node_modules not found - running npm install first..."
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

Write-Host "Starting FastAPI backend on http://localhost:8000 ..."
$backendProc = Start-Process -FilePath $VenvPython `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000" `
    -WorkingDirectory $BackendDir -PassThru -NoNewWindow

Write-Host "Starting Next.js frontend on http://localhost:3000 ..."
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
$npmPath = if ($npmCmd) { $npmCmd.Source } else { "npm.cmd" }
$frontendProc = Start-Process -FilePath $npmPath -ArgumentList "run", "dev" `
    -WorkingDirectory $FrontendDir -PassThru -NoNewWindow

try {
    Wait-Process -Id $backendProc.Id, $frontendProc.Id
}
finally {
    Write-Host "Shutting down..."
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
}
