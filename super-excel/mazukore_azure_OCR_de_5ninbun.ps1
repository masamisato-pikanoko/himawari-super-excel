param(
  [Parameter(Mandatory = $true)][string]$Inbox,
  [Parameter(Mandatory = $true)][string]$Outbox,
  [switch]$Deliver,
  [string]$NodePath = 'C:\Users\sosin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
)

$ErrorActionPreference = 'Stop'
$resourceGroup = 'rg-pikanoko-dev-japaneast'
$resourceName = 'di-himawari-excel-260824'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $scriptRoot 'mazukore_5ninbun_wo_yakan_shori.mjs'
$resolvedInbox = (Resolve-Path -LiteralPath $Inbox).Path
$resolvedOutbox = [IO.Path]::GetFullPath($Outbox)

if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
  throw "Node runtime が見つかりません: $NodePath"
}
if ($resolvedOutbox -eq $resolvedInbox) {
  throw '受取フォルダと結果フォルダは分けてください。'
}
New-Item -ItemType Directory -Force -Path $resolvedOutbox | Out-Null

$oldEndpoint = $env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
$oldKey = $env:AZURE_DOCUMENT_INTELLIGENCE_KEY
try {
  $env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = az cognitiveservices account show `
    --resource-group $resourceGroup `
    --name $resourceName `
    --query properties.endpoint `
    --output tsv
  $env:AZURE_DOCUMENT_INTELLIGENCE_KEY = az cognitiveservices account keys list `
    --resource-group $resourceGroup `
    --name $resourceName `
    --query key1 `
    --output tsv
  if (-not $env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT -or -not $env:AZURE_DOCUMENT_INTELLIGENCE_KEY) {
    throw 'Azure Document Intelligence の接続情報を取得できませんでした。'
  }
  $arguments = @($runner, '--inbox', $resolvedInbox, '--outbox', $resolvedOutbox)
  if ($Deliver) { $arguments += '--deliver' }
  & $NodePath @arguments
  if ($LASTEXITCODE -ne 0) { throw "夜間バッチが終了コード $LASTEXITCODE で停止しました。" }
} finally {
  $env:AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = $oldEndpoint
  $env:AZURE_DOCUMENT_INTELLIGENCE_KEY = $oldKey
}
