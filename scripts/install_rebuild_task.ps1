# Registers R4_KPI_Rebuild on the R4 machine: npm run kpi:rebuild every morning at 07:00, after
# R4_Daily_Push (06:00) and R4_Verishred_Push (06:30). The admin login stays in this checkout's .env,
# on that machine, never on Render (docs/DEPLOY.md).
#
# Once, in PowerShell, in the repo folder on the R4 machine, signed in as tsaran:
#   powershell -ExecutionPolicy Bypass -File scripts\install_rebuild_task.ps1 -DryRun   # shows what it would register
#   powershell -ExecutionPolicy Bypass -File scripts\install_rebuild_task.ps1
#
# The task runs the same way as the two push tasks: as tsaran, LogonType Interactive. So it fires only
# while that session exists (disconnect the Remote Desktop with the X, never sign out) until R4's IT
# sets all three to "run whether the user is logged on or not" (DECISIONS.md, "Daily push").
#
# The task itself calls this file with -Run, which rebuilds and appends to logs\kpi_rebuild.txt.
param([switch]$Run, [switch]$DryRun, [string]$At = '07:00')

$repo = Split-Path -Parent $PSScriptRoot
$name = 'R4_KPI_Rebuild'

if ($Run) {
  Set-Location $repo
  New-Item -ItemType Directory -Force (Join-Path $repo 'logs') | Out-Null
  $log = Join-Path $repo 'logs\kpi_rebuild.txt'
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm') start" | Out-File $log -Append -Encoding utf8
  $out = & npm.cmd run kpi:rebuild 2>&1 | Out-String
  $code = $LASTEXITCODE
  $out.Trim() | Out-File $log -Append -Encoding utf8
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $(if ($code -eq 0) { 'ok' } else { "FAILED (exit $code)" })" | Out-File $log -Append -Encoding utf8
  exit $code
}

if (-not (Test-Path (Join-Path $repo '.env'))) { Write-Error "No .env in ${repo}: the rebuild needs the admin DATABASE_URL there."; exit 1 }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Error 'npm is not on PATH: install Node 20 or later first.'; exit 1 }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Run" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 30) -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

if ($DryRun) {
  "Would register $name for $env:USERDOMAIN\$env:USERNAME, daily at $At, Interactive:"
  "  powershell.exe $($action.Arguments)"
  "  in $repo; log in logs\kpi_rebuild.txt"
  exit 0
}

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description 'R4 Pulse: npm run kpi:rebuild after the daily push' -Force | Out-Null
"Registered $name, daily at $At. Run it now with: Start-ScheduledTask $name"
"Then read logs\kpi_rebuild.txt: the last line should say ok."
