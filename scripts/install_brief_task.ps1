# Registers R4_Morning_Brief on the R4 machine: the morning emails (scripts/send_brief.js) every
# weekday at 07:15, after R4_Daily_Push (06:00), R4_Verishred_Push (06:30) and R4_KPI_Rebuild (07:00).
# The mailbox password and the database login stay in this checkout's .env, on that machine.
#
# Once, in PowerShell, in the repo folder on the R4 machine, signed in as tsaran:
#   powershell -ExecutionPolicy Bypass -File scripts\install_rebuild_task.ps1 -DryRun   # shows what it would register
#   powershell -ExecutionPolicy Bypass -File scripts\install_rebuild_task.ps1
#
# The task runs the same way as the two push tasks: as tsaran, LogonType Interactive. So it fires only
# while that session exists (disconnect the Remote Desktop with the X, never sign out) until R4's IT
# sets all three to "run whether the user is logged on or not" (DECISIONS.md, "Daily push").
#
# The task itself calls this file with -Run, which sends and appends to logs\brief.txt.
# Try it first without sending: node scripts\send_brief.js --dry-run  (writes logs\brief\*.html)
param([switch]$Run, [switch]$DryRun, [string]$At = '07:15')

$repo = Split-Path -Parent $PSScriptRoot
$name = 'R4_Morning_Brief'

if ($Run) {
  Set-Location $repo
  New-Item -ItemType Directory -Force (Join-Path $repo 'logs') | Out-Null
  $log = Join-Path $repo 'logs\brief.txt'
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm') start" | Out-File $log -Append -Encoding utf8
  $out = & node.exe scripts\send_brief.js 2>&1 | Out-String
  $code = $LASTEXITCODE
  $out.Trim() | Out-File $log -Append -Encoding utf8
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $(if ($code -eq 0) { 'ok' } else { "FAILED (exit $code)" })" | Out-File $log -Append -Encoding utf8
  exit $code
}

if (-not (Test-Path (Join-Path $repo '.env'))) { Write-Error "No .env in ${repo}: the brief needs DATABASE_URL, BRIEF_TO, BRIEF_FROM, BRIEF_SMTP_USER, BRIEF_SMTP_PASS, PULSE_URL and FEEDBACK_SECRET there."; exit 1 }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Error 'npm is not on PATH: install Node 20 or later first.'; exit 1 }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Run" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 30) -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

if ($DryRun) {
  "Would register $name for $env:USERDOMAIN\$env:USERNAME, weekdays at $At, Interactive:"
  "  powershell.exe $($action.Arguments)"
  "  in $repo; log in logs\brief.txt"
  exit 0
}

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description 'R4 Pulse: the morning emails, after the push and the KPI rebuild' -Force | Out-Null
"Registered $name, weekdays at $At. Run it now with: Start-ScheduledTask $name"
"Then read logs\brief.txt: the last line should say ok, after one 'sent' line per person."
