# Agent State Stack - daemon guard
# v5 (fork era): fork 0.5.1-fork.1 runs ONE global daemon (--global) covering all registry
#   projects; guard = kill strays -> restart the single global chain -> verify 1 + fork version.
# v4 history: restarted ALL relay projects' daemons (pre-fork, per-project daemons).
# ASCII-only on purpose: must parse identically under PowerShell 5.1 and 7.
# Called via: pwsh -NoProfile -ExecutionPolicy Bypass -File <this file>
$ErrorActionPreference = 'SilentlyContinue'

# 0) Self-heal: quote node path in watch-task.cmd files (upstream #1 workaround for pre-fork
#    generated files; fork-generated cmds are already quoted and won't match this regex)
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

# 2) Start exactly one global daemon via the registered logon chain (Run key -> D drive watch-task.vbs)
Start-Process wscript.exe -ArgumentList '"D:\agent1super\.sessionrelay\watch-task.vbs"' -WindowStyle Hidden
Start-Sleep -Seconds 10

# 3) Verify: exactly 1 instance + fresh heartbeat in watch.log
$c = (Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'srelay\.js.*watch --foreground' }).Count
Write-Output ("Instances: " + $c + " (expected 1, global mode)")

$log = "D:\agent1super\.sessionrelay\watch.log"
if (Test-Path $log) {
  Write-Output ("Log tail: " + (Get-Content $log -Tail 1))
}

# 4) Fork deployment check (dist-patch era is retired; verify the installed package IS the fork)
$pkgJson = "C:\Users\crx\AppData\Roaming\npm\node_modules\@ewanjasper\sessionrelay\package.json"
$forkStatus = "check-skipped (package.json missing)"
if (Test-Path $pkgJson) {
  $ver = (Get-Content $pkgJson -Raw | ConvertFrom-Json).version
  if ($ver -like "0.5.1-fork*") { $forkStatus = "OK ($ver)" }
  else { $forkStatus = "UPSTREAM $ver detected -> fork lost (npm update ran?); restore: node D:\agent1super\scripts\srelay-local-patches\install-fork.ps1" }
}
Write-Output ("Fork: " + $forkStatus)

# 5) Daily trail (scheduled task output is invisible; one line per run)
Add-Content -LiteralPath "D:\agent1super\.sessionrelay\guard.log" -Value ("{0}  instances={1}/1  fork={2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $c, $forkStatus) -Encoding UTF8
Write-Output "Note: 'srelay watch --status' is per-project (checks cwd lock). Trust this output, guard.log, or the log heartbeat."

# 6) Refresh dashboards (dashboard.html is a SNAPSHOT of progress.md; bound staleness to <= 1 day.
#    Instant refresh stays available via the "刷新面板" command. CJK roots come from the E:\* glob,
#    keeping this file ASCII-only.)
$gen = "D:\agent1super\agent-state-stack\scripts\gen_dashboard.mjs"
$dashRoots = @("D:\agent1super", "E:\music player")
$eVbs = (Get-Item "E:\*\.sessionrelay\watch-task.vbs" -ErrorAction SilentlyContinue).FullName
if ($eVbs) { $dashRoots += ($eVbs | ForEach-Object { Split-Path (Split-Path $_) }) }
$dashRoots = $dashRoots | Where-Object { $_ } | Select-Object -Unique
$dashOk = 0
foreach ($r in $dashRoots) {
  if ((Test-Path "$r\progress.md") -and (Test-Path $gen)) {
    & "D:\agent1super\node\node.exe" $gen $r | Out-Null
    if ($LASTEXITCODE -eq 0) { $dashOk++ }
  }
}
Write-Output ("Dashboards refreshed: " + $dashOk + "/" + $dashRoots.Count)
Add-Content -LiteralPath "D:\agent1super\.sessionrelay\guard.log" -Value ("{0}  dashboards={1}/{2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $dashOk, $dashRoots.Count) -Encoding UTF8
