param(
  [string]$DriveRoot = 'H:\マイドライブ\🌻ひまわりシステム_DEV',
  [string]$TaskName = 'HimawariPilotWorker'
)

$ErrorActionPreference = 'Stop'
$pilotDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $pilotDir 'timetorigaa_windows_worker.ps1'

if (-not (Test-Path -LiteralPath $DriveRoot -PathType Container)) {
  throw "🌻ひまわりシステム_DEVが見つかりません: $DriveRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $DriveRoot 'JOBS') -PathType Container)) {
  throw "対象が🌻ひまわりシステム_DEVではありません: $DriveRoot"
}
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
  throw "Worker入口が見つかりません: $runner"
}

$defaultDriveRoot = 'H:\マイドライブ\🌻ひまわりシステム_DEV'
$argument = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $runner
if ($DriveRoot -ne $defaultDriveRoot) {
  $argument += ' -DriveRoot "{0}"' -f $DriveRoot
}
$powerShell7 = (Get-Command pwsh.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powerShell7 -Argument $argument -WorkingDirectory $pilotDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description '🌻ひまわり試運転: Drive JOBSを5分ごとに安全処理' -Force | Out-Null

[pscustomobject]@{
  task_name = $TaskName
  drive_root = $DriveRoot
  interval_minutes = 5
  wake_to_run = $true
  secret_values_were_not_printed = $true
}
