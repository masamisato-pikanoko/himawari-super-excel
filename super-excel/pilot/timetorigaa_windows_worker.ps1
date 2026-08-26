param(
  [string]$DriveRoot = 'H:\マイドライブ\🌻ひまわりシステム_DEV'
)

$ErrorActionPreference = 'Stop'
$pilotDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$superExcelDir = Split-Path -Parent $pilotDir
$workerScript = Join-Path $superExcelDir 'worker\himawari-drive-worker.mjs'
$envFile = Join-Path $pilotDir '.env.local'
$safeLogDir = Join-Path $pilotDir 'runtime-logs'
$safeLogPath = Join-Path $safeLogDir 'task-safe.jsonl'
New-Item -ItemType Directory -Force -Path $safeLogDir | Out-Null

function Write-SafeTaskLog([string]$status, [string]$detail) {
  $record = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    status = $status
    detail = $detail
    drive_root_available = (Test-Path -LiteralPath $DriveRoot -PathType Container)
  }
  Add-Content -LiteralPath $safeLogPath -Value ($record | ConvertTo-Json -Compress) -Encoding UTF8
}

Write-SafeTaskLog 'STARTED' 'scheduled worker entry'

if (-not (Test-Path -LiteralPath $workerScript -PathType Leaf)) {
  Write-SafeTaskLog 'FAILED' 'WORKER_SCRIPT_NOT_FOUND'
  throw "Windows Workerが見つかりません: $workerScript"
}
if (-not (Test-Path -LiteralPath $DriveRoot -PathType Container)) {
  Write-SafeTaskLog 'FAILED' 'DRIVE_ROOT_NOT_FOUND'
  throw "🌻ひまわりシステム_DEVが見つかりません: $DriveRoot"
}

if (Test-Path -LiteralPath $envFile -PathType Leaf) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $parts = $trimmed.Split('=', 2)
    if ($parts.Count -ne 2 -or $parts[0] -notmatch '^[A-Z][A-Z0-9_]*$') { continue }
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process')
  }
}

# A形式の領収書OCRだけに必要。鍵はファイルやログへ保存せず、既存Azureログインから実行時取得する。
if (-not $env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT -or -not $env:AZURE_DOCUMENT_INTELLIGENCE_KEY) {
  $azCommand = Get-Command az.cmd -ErrorAction SilentlyContinue
  if ($azCommand) {
    $diResourceGroup = 'rg-pikanoko-dev-japaneast'
    $diAccountName = 'di-himawari-excel-260824'
    $diEndpoint = & $azCommand.Source cognitiveservices account show `
      --resource-group $diResourceGroup --name $diAccountName `
      --query 'properties.endpoint' --output tsv --only-show-errors 2>$null
    $endpointExitCode = $LASTEXITCODE
    $diKey = & $azCommand.Source cognitiveservices account keys list `
      --resource-group $diResourceGroup --name $diAccountName `
      --query 'key1' --output tsv --only-show-errors 2>$null
    $keyExitCode = $LASTEXITCODE
    if ($endpointExitCode -eq 0 -and $keyExitCode -eq 0 -and $diEndpoint -and $diKey) {
      [Environment]::SetEnvironmentVariable('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', $diEndpoint.Trim(), 'Process')
      [Environment]::SetEnvironmentVariable('AZURE_DOCUMENT_INTELLIGENCE_KEY', $diKey.Trim(), 'Process')
    }
  }
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node $workerScript --root $DriveRoot
Write-SafeTaskLog 'FINISHED' ('NODE_EXIT_' + $LASTEXITCODE)
exit $LASTEXITCODE
