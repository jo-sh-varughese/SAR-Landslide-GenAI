Write-Host "Starting diffusion-explainer backend (http://127.0.0.1:8010) and frontend (http://localhost:5731)..."

$backend = Start-Process -FilePath "powershell" -ArgumentList @(
  "-NoExit", "-Command",
  "cd `"$PSScriptRoot\backend`"; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8010"
) -PassThru

$frontend = Start-Process -FilePath "powershell" -ArgumentList @(
  "-NoExit", "-Command",
  "cd `"$PSScriptRoot\frontend`"; npm run dev"
) -PassThru

Write-Host "Backend PID:  $($backend.Id)"
Write-Host "Frontend PID: $($frontend.Id)"
Write-Host ""
Write-Host "Backend docs:  http://127.0.0.1:8010/docs"
Write-Host "Frontend app:  http://localhost:5731"
Write-Host ""
Write-Host "Close the two spawned PowerShell windows to stop the servers."
