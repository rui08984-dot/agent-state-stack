# Agent State Stack - daemon guard (ensures exactly ONE srelay watch instance)
# Called by watch-guard.cmd. Logic lives here to avoid cmd quoting hell.
$ErrorActionPreference = 'SilentlyContinue'

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
Write-Output "Note: 'srelay watch --status' is per-project (checks cwd lock). Trust this output or the log heartbeat."
