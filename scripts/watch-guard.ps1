# Agent State Stack - daemon guard (ensures exactly ONE srelay watch instance)
# v3: + self-heal for upstream #1 (auto-quotes node path if --install-service regenerated unquoted cmd)
#     + local-patch integrity check (npm update silently reverts dist patches -> fail loudly here)
#     + daily guard.log trail (scheduled task output is invisible)
# Called via: pwsh -NoProfile -ExecutionPolicy Bypass -File <this file>
$ErrorActionPreference = 'SilentlyContinue'

# 0) Self-heal: quote node path in watch-task.cmd files (upstream #1 workaround)
foreach ($cmdFile in @("E:\music player\.sessionrelay\watch-task.cmd", "D:\agent1super\.sessionrelay\watch-task.cmd")) {
  if (Test-Path $cmdFile) {
    $raw = Get-Content $cmdFile -Raw
    if ($raw -match '(?m)^C:\\Program Files\\nodejs\\node\.exe') {
      $fixed = $raw -replace '(?m)^C:\\Program Files\\nodejs\\node\.exe', '"C:\Program Files\nodejs\node.exe"'
      Set-Content -Path $cmdFile -Value $fixed -Encoding UTF8
      Write-Output ("self-heal: quoted node path in " + $cmdFile)
    }
  }
}

# 1) Kill ALL existing watch instances (matched by command line, other node procs untouched)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'srelay\.js.*watch --foreground' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Seconds 2

# 2) Start exactly one via the registered logon chain (Run key -> E drive watch-task.vbs)
Start-Process wscript.exe -ArgumentList '"E:\music player\.sessionrelay\watch-task.vbs"' -WindowStyle Hidden
Start-Sleep -Seconds 8

# 3) Verify: exactly 1 instance + fresh heartbeat in watch.log
$c = (Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'srelay\.js.*watch --foreground' }).Count
Write-Output ("Instances: " + $c + " (expected 1)")

$log = "E:\music player\.sessionrelay\watch.log"
if (Test-Path $log) {
  Write-Output ("Log tail: " + (Get-Content $log -Tail 1))
}

# 4) Local-patch integrity check (npm update silently reverts dist patches -> fail loudly)
$patchScript = "D:\agent1super\scripts\srelay-local-patches\apply-srelay-patches.mjs"
$patchStatus = "check-skipped (script missing)"
if (Test-Path $patchScript) {
  $v = & "D:\agent1super\node\node.exe" $patchScript --verify 2>&1
  if ($LASTEXITCODE -ne 0) { $patchStatus = "FAIL -> re-run: node D:\agent1super\scripts\srelay-local-patches\apply-srelay-patches.mjs" }
  else { $patchStatus = "OK" }
}
Write-Output ("Patches: " + $patchStatus)

# 5) Daily trail (scheduled task output is invisible; one line per run)
Add-Content -LiteralPath "D:\agent1super\.sessionrelay\guard.log" -Value ("{0}  instances={1}  patches={2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $c, $patchStatus) -Encoding UTF8
Write-Output "Note: 'srelay watch --status' is per-project (checks cwd lock). Trust this output, guard.log, or the log heartbeat."
