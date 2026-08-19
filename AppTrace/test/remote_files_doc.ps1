# remote_files_doc.ps1 - Document mode: pass ONLY the file path; the tool opens
# it with the default associated app (user double-click scenario).
$work = 'C:\Users\LABS\Desktop\AppTrace'
$dir = 'C:\Users\LABS\Desktop\PPT&EXCEL'
$office = 'C:\Program Files\Microsoft Office'

$cases = @(
    @{ n = 1; file = 'EXCEL-10M-COUNT.xlsx' },
    @{ n = 2; file = 'EXCEL-100M-COUNT.xlsx' },
    @{ n = 3; app = "$office\root\Office16\POWERPNT.EXE"; file = 'PPT-30M-COUNT.pptx' },
    @{ n = 4; file = 'PPT-100M-COUNT.pptx' }
)

function Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Add-Content -Path "$work\progress4.log" -Value $line -Encoding UTF8
    Write-Output $line
}

Remove-Item "$work\progress4.log", "$work\doc_results.jsonl" -ErrorAction SilentlyContinue
foreach ($f in Get-ChildItem "$work\out4_*.txt" -ErrorAction SilentlyContinue) { Remove-Item $f }

$shellRx = '^(explorer|ApplicationFrameHost|SearchHost|StartMenuExperienceHost|TextInputHost|ShellExperienceHost|SystemSettings|Widgets|WindowsTerminal|cmd|powershell|conhost|schtasks)'

foreach ($c in $cases) {
    $path = Join-Path $dir $c.file
    Log ("---- [{0}/4] {1} (default app) : START" -f $c.n, $c.file)

    Get-Process AppTrace -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "ExecutablePath != NULL" |
        Where-Object { $_.ExecutablePath -like ($office + '*') } |
        ForEach-Object {
            Log ("pre-clean: " + $_.Name + " pid=" + $_.ProcessId)
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    Start-Sleep 1
    $dirty = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch $shellRx }
    foreach ($d in $dirty) {
        Log ("pre-clean window: $($d.ProcessName)")
        Stop-Process -Id $d.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep 1
    }

    $cmdFile = "$work\doc_run_$($c.n).cmd"
    $outFile = "$work\out4_$($c.n).txt"
    Set-Content -Path $cmdFile -Encoding Default -Value @(
        '@echo off',
        ('"{0}\AppTrace.exe" --timeout 180 --grace 5 --debug -o "{0}\doc_results.jsonl" -- "{1}" > "{2}" 2>&1' -f $work, $path, $outFile),
        ('echo exitcode=%ERRORLEVEL% >> "{0}"' -f $outFile)
    )
    $tn = "AppTraceD$($c.n)"
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
        Log ("file {0}: still running after 240s, killing" -f $c.n)
        Stop-Process -Name AppTrace -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep 2
    schtasks /delete /tn $tn /f | Out-Null
    Remove-Item $cmdFile -ErrorAction SilentlyContinue

    $left = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch $shellRx }
    foreach ($p in $left) {
        Log ("post-clean leftover: $($p.ProcessName)")
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }

    $json = (Select-String -Path $outFile -Pattern '^\{"target"' | Select-Object -Last 1).Line
    Log ("{0} : DONE  {1}" -f $c.file, $json)
    Start-Sleep 3
}
Log "DOC TESTS ALL DONE"
