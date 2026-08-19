# remote_files.ps1 - Measure open speed of the Office files in Desktop\PPT&EXCEL.
# Launches the native app (EXCEL.EXE / POWERPNT.EXE) with the file as argument,
# measuring launch -> first window frame. Same clean-environment discipline:
# per-file pre-clean (kill Office processes), post-clean verification.

$work = 'C:\Users\LABS\Desktop\AppTrace'
$dir = 'C:\Users\LABS\Desktop\PPT&EXCEL'
$office = 'C:\Program Files\Microsoft Office\root\Office16'

$cases = @(
    @{ n = 1; app = "$office\EXCEL.EXE";   file = 'EXCEL-10M-COUNT.xlsx' },
    @{ n = 2; app = "$office\EXCEL.EXE";   file = 'EXCEL-100M-COUNT.xlsx' },
    @{ n = 3; app = "$office\POWERPNT.EXE"; file = 'PPT-30M-COUNT.pptx' },
    @{ n = 4; app = "$office\POWERPNT.EXE"; file = 'PPT-100M-COUNT.pptx' }
)

function Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Add-Content -Path "$work\progress3.log" -Value $line -Encoding UTF8
    Write-Output $line
}

Remove-Item "$work\progress3.log", "$work\file_results.jsonl" -ErrorAction SilentlyContinue
foreach ($f in Get-ChildItem "$work\out3_*.txt" -ErrorAction SilentlyContinue) { Remove-Item $f }

$shellRx = '^(explorer|ApplicationFrameHost|SearchHost|StartMenuExperienceHost|TextInputHost|ShellExperienceHost|SystemSettings|Widgets|WindowsTerminal|cmd|powershell|conhost|schtasks)'

foreach ($c in $cases) {
    $path = Join-Path $dir $c.file
    Log ("---- [{0}/4] {1} : START" -f $c.n, $c.file)

    # Pre-clean: kill every Office process from the install root; no stray
    # measurement process; no visible window. Excel/PowerPoint are
    # single-instance - a leftover instance would turn this into a reuse open
    # and skew the cold-load timing.
    Get-Process AppTrace -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "ExecutablePath != NULL" |
        Where-Object { $_.ExecutablePath -like ($office + '\*') } |
        ForEach-Object {
            Log ("pre-clean: " + $_.Name + " pid=" + $_.ProcessId)
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    Start-Sleep 1
    $dirty = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch $shellRx }
    foreach ($d in $dirty) {
        Log ("pre-clean window: $($d.ProcessName) '$($d.MainWindowTitle)'")
        Stop-Process -Id $d.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep 1
    }

    $cmdFile = "$work\file_run_$($c.n).cmd"
    $outFile = "$work\out3_$($c.n).txt"
    Set-Content -Path $cmdFile -Encoding Default -Value @(
        '@echo off',
        ('"{0}\AppTrace.exe" --timeout 180 --grace 5 --debug -o "{0}\file_results.jsonl" -- "{1}" "{2}" > "{3}" 2>&1' -f $work, $c.app, $path, $outFile),
        ('echo exitcode=%ERRORLEVEL% >> "{0}"' -f $outFile)
    )
    $tn = "AppTraceF$($c.n)"
    schtasks /create /tn $tn /tr "$cmdFile" /sc once /st 23:59 /rl highest /it /f | Out-Null
    schtasks /run /tn $tn | Out-Null

    $appear = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $appear -and -not (Get-Process AppTrace -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 400
    }
    $deadline = (Get-Date).AddSeconds(240)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process AppTrace -ErrorAction SilentlyContinue)) { break }
        Start-Sleep 5
    }
    if (Get-Process AppTrace -ErrorAction SilentlyContinue) {
        Log ("file {0}: measurement still running after 240s, killing" -f $c.n)
        Stop-Process -Name AppTrace -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep 2
    schtasks /delete /tn $tn /f | Out-Null
    Remove-Item $cmdFile -ErrorAction SilentlyContinue

    $left = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch $shellRx }
    foreach ($p in $left) {
        Log ("post-clean leftover: $($p.ProcessName) '$($p.MainWindowTitle)'")
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }

    $json = (Select-String -Path $outFile -Pattern '^\{"target"' | Select-Object -Last 1).Line
    Log ("{0} : DONE  {1}" -f $c.file, $json)
    Start-Sleep 3
}
Log "FILE TESTS ALL DONE"
