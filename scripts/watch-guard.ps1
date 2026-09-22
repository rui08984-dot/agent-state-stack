# Agent State Stack - daemon guard (ensures exactly ONE srelay watch instance per project)
# v4: + self-heal for upstream #1 (auto-quotes node path if --install-service regenerated unquoted cmd)
#     + local-patch integrity check (npm update silently reverts dist patches -> fail loudly here)
#     + daily guard.log trail (scheduled task output is invisible)
#     + red-team F2 (0922): restart ALL relay projects' daemons, not just the Run-key one
#       (previous behavior left non-key projects un-captured from 10:00 until their next CLI use)
# ASCII-only on purpose: must parse identically under PowerShell 5.1 and 7 (no CJK literals).
# Called via: pwsh -NoProfile -ExecutionPolicy Bypass -File <this file>
$ErrorActionPreference = 'SilentlyContinue'

# 0) Self-heal: quote node path in watch-task.cmd files (upstream #1 workaround; ASCII-path files only,
#    CJK-path cmds are excluded on purpose - re-encoding them here could corrupt the UTF-8 content)
foreach ($cmdFile in @("D:\agent1super\.sessionrelay\watch-task.cmd", "E:\music player\.sessionrelay\watch-task.cmd")) {
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

# 2) Start one daemon per registered relay project (per-project daemons are legitimate; the
#    per-project named-pipe lock dedupes any surplus). E:\* glob auto-covers CJK-path projects.
$vbsList = @("D:\agent1super\.sessionrelay\watch-task.vbs", "E:\music player\.sessionrelay\watch-task.vbs")
$eGlob = (Get-Item "E:\*\.sessionrelay\watch-task.vbs" -ErrorAction SilentlyContinue).FullName
if ($eGlob) { $vbsList += $eGlob }
$vbsList = $vbsList | Where-Object { $_ } | Select-Object -Unique
foreach ($vbs in $vbsList) {
  Start-Process wscript.exe -ArgumentList ('"' + $vbs + '"') -WindowStyle Hidden
}
Start-Sleep -Seconds 8

# 3) Verify: one instance per project + fresh heartbeat in watch.log
$c = (Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'srelay\.js.*watch --foreground' }).Count
Write-Output ("Instances: " + $c + " (expected " + $vbsList.Count + ")")

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
Add-Content -LiteralPath "D:\agent1super\.sessionrelay\guard.log" -Value ("{0}  instances={1}/{2}  patches={3}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $c, $vbsList.Count, $patchStatus) -Encoding UTF8
Write-Output "Note: 'srelay watch --status' is per-project (checks cwd lock). Trust this output, guard.log, or the log heartbeat."
