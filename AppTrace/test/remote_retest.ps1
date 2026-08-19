# remote_retest.ps1 - Re-run selected apps (indices in retest.list, one per
# line) with --debug, same clean-environment discipline as remote_batch.ps1.

$work = 'C:\Users\LABS\Desktop\AppTrace'
$idxs = Get-Content "$work\retest.list" | Where-Object { $_.Trim() -match '^\d+$' } | ForEach-Object { [int]$_.Trim() }
$sh = New-Object -ComObject WScript.Shell

function Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Add-Content -Path "$work\progress2.log" -Value $line -Encoding UTF8
    Write-Output $line
}

Remove-Item "$work\progress2.log", "$work\results2.jsonl" -ErrorAction SilentlyContinue
foreach ($f in Get-ChildItem "$work\out2_*.txt" -ErrorAction SilentlyContinue) { Remove-Item $f }

$shellRx = '^(explorer|ApplicationFrameHost|SearchHost|StartMenuExperienceHost|TextInputHost|ShellExperienceHost|SystemSettings|Widgets|WindowsTerminal|cmd|powershell|conhost|schtasks)'

$total = $idxs.Count
$k = 0
foreach ($i in $idxs) {
    $k++
    $lnkLine = Get-Content "$work\apps.list" | Where-Object { $_ -like "$i|*" }
    $name = ($lnkLine -split '\|')[1]
    $appPath = ($lnkLine -split '\|')[2]
    Log ("---- [$k/$total] #$i $name : START")

    # Pre-clean 1: kill every process installed under this app's root dir.
    # Failed-correlation runs of previous versions leaked the real app's
    # background processes (teardown only covers the tracked tree), and a
    # leftover instance turns the next launch into a polluted reuse scenario.
    # Edge is exempt: its startup-boost instance IS the realistic reuse case.
    $target = $sh.CreateShortcut($appPath).TargetPath
    $texe = [IO.Path]::GetFileName($target).ToLowerInvariant()
    if ($texe -ne 'msedge.exe' -and $target) {
        $root = Split-Path $target
        Get-CimInstance Win32_Process -Filter "ExecutablePath != NULL" |
            Where-Object { $_.ExecutablePath -like ($root + '\*') -or $_.ExecutablePath -eq $target } |
            ForEach-Object {
                Log ("pre-clean root-kill: " + $_.Name + " pid=" + $_.ProcessId)
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
        Start-Sleep 1
    }

    # Pre-clean 2: no stray measurement process or visible window.
    Get-Process AppTrace -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $dirty = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch $shellRx }
    foreach ($d in $dirty) {
        Log ("pre-clean leftover: $($d.ProcessName) '$($d.MainWindowTitle)'")
        Stop-Process -Id $d.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep 1
    }

    $cmdFile = "$work\retest_$i.cmd"
    $outFile = "$work\out2_$i.txt"
    Set-Content -Path $cmdFile -Encoding Default -Value @(
        '@echo off',
        ('"{0}\AppTrace.exe" --timeout 90 --grace 5 --debug -o "{0}\results2.jsonl" -- "{1}" > "{2}" 2>&1' -f $work, $appPath, $outFile),
        ('echo exitcode=%ERRORLEVEL% >> "{0}"' -f $outFile)
    )
    $tn = "AppTraceRT$i"
    schtasks /create /tn $tn /tr "$cmdFile" /sc once /st 23:59 /rl highest /it /f | Out-Null
    schtasks /run /tn $tn | Out-Null

    # Wait for the measurement to appear, then to finish (max 200s total).
    $appear = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $appear -and -not (Get-Process AppTrace -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 400
    }
    $deadline = (Get-Date).AddSeconds(200)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process AppTrace -ErrorAction SilentlyContinue)) { break }
        Start-Sleep 5
    }
    if (Get-Process AppTrace -ErrorAction SilentlyContinue) {
        Log ("#$i TIMEOUT after 200s, killing")
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
    Log ("#$i $name : DONE  $json")
    Start-Sleep 3
}
Log "RETEST ALL DONE"
