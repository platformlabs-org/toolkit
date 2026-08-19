# remote_batch.ps1 - Runs on LABS-XIAOXIN via Invoke-Command -FilePath.
# Tests every desktop app shortcut one by one with AppTrace.exe, keeping
# the environment clean between runs (no leftover windows allowed).
# ASCII-only on purpose: the script file is parsed locally by powershell.exe
# (ANSI when no BOM), so Chinese .lnk names are discovered remotely as objects
# and never written as literals here.

$work = 'C:\Users\LABS\Desktop\AppTrace'
$apps = @()
$apps += Get-ChildItem 'C:\Users\LABS\Desktop\*.lnk' -ErrorAction SilentlyContinue |
         Where-Object { $_.Name -notmatch 'nas' }
$apps += Get-ChildItem 'C:\Users\Public\Desktop\*.lnk' -ErrorAction SilentlyContinue

# Fresh state files.
Remove-Item "$work\results.jsonl", "$work\progress.log", "$work\apps.list" -ErrorAction SilentlyContinue
foreach ($f in Get-ChildItem "$work\out_*.txt" -ErrorAction SilentlyContinue) { Remove-Item $f }

function Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
    Add-Content -Path "$work\progress.log" -Value $line -Encoding UTF8
    Write-Output $line
}

Log ("found {0} app(s)" -f $apps.Count)

$i = 0
foreach ($app in $apps) {
    $i++
    $name = [IO.Path]::GetFileNameWithoutExtension($app.Name)
    Add-Content -Path "$work\apps.list" -Value ("{0}|{1}|{2}" -f $i, $name, $app.FullName) -Encoding UTF8

    Log ("---- [$i/$($apps.Count)] $name : START")

    # Pre-check: environment must be clean (no visible non-shell windows).
    $shellRx = '^(explorer|ApplicationFrameHost|SearchHost|StartMenuExperienceHost|TextInputHost|ShellExperienceHost|SystemSettings|Widgets|WindowsTerminal|cmd|powershell|conhost|schtasks)'
    $dirty = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch $shellRx }
    foreach ($d in $dirty) {
        Log ("[$i] pre-clean leftover window: $($d.ProcessName) pid=$($d.Id) '$($d.MainWindowTitle)'")
        Stop-Process -Id $d.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep 1
    }

    # Wrapper cmd (Default encoding = ANSI/GBK so Chinese paths survive cmd.exe).
    $cmdFile = "$work\run_$i.cmd"
    $outFile = "$work\out_$i.txt"
    Set-Content -Path $cmdFile -Encoding Default -Value @(
        '@echo off',
        ('"{0}\AppTrace.exe" --timeout 90 --grace 5 -o "{0}\results.jsonl" -- "{1}" > "{2}" 2>&1' -f $work, $app.FullName, $outFile),
        ('echo exitcode=%ERRORLEVEL% >> "{0}"' -f $outFile)
    )

    $tn = "AppTrace$i"
    schtasks /create /tn $tn /tr "$cmdFile" /sc once /st 23:59 /rl highest /it /f | Out-Null
    schtasks /run /tn $tn | Out-Null

    # Wait for the measurement process to finish (max 200s).
    $deadline = (Get-Date).AddSeconds(200)
    Start-Sleep 3
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process AppTrace -ErrorAction SilentlyContinue)) { break }
        Start-Sleep 5
    }
    if (Get-Process AppTrace -ErrorAction SilentlyContinue) {
        Log ("[$i] TIMEOUT: AppTrace still running after 200s, killing")
        Stop-Process -Name AppTrace -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep 2
    schtasks /delete /tn $tn /f | Out-Null
    Remove-Item $cmdFile -ErrorAction SilentlyContinue

    # Post-clean: guarantee no leftover app windows for the next test.
    $left = Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.ProcessName -notmatch $shellRx }
    foreach ($p in $left) {
        Log ("[$i] post-clean leftover window: $($p.ProcessName) pid=$($p.Id) '$($p.MainWindowTitle)'")
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }

    $json = (Select-String -Path $outFile -Pattern '^\{"target"' | Select-Object -Last 1).Line
    Log ("[$i] $name : DONE  $json")
    Start-Sleep 3
}

Log "ALL DONE"
