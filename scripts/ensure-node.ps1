param(
  [Parameter(Mandatory = $true)]
  [string]$Architecture
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$version = "22.23.2"
$downloads = @{
  "x64" = @{
    Platform = "win-x64"
    Sha256 = "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97"
  }
  "arm64" = @{
    Platform = "win-arm64"
    Sha256 = "fec025a6da31757e3b6af84c5a1628e9d38442ca99a2161091d78f2fcfa35ef3"
  }
  "ia32" = @{
    Platform = "win-x86"
    Sha256 = "725c9e2bdd1c2016b41c995a81f4fa36ce4e2ee565b7455d8f889182727df647"
  }
}

if (-not $downloads.ContainsKey($Architecture)) {
  throw "Unsupported Windows Node architecture: $Architecture"
}

$platform = $downloads[$Architecture].Platform
$expectedHash = $downloads[$Architecture].Sha256
$folderName = "node-v$version-$platform"
$runtimeRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ".sp-api-runtime"
$nodeFolder = Join-Path $runtimeRoot $folderName
$nodeExe = Join-Path $nodeFolder "node.exe"

if (Test-Path $nodeExe) {
  Write-Host "[SP-API] Project-local Node.js $version is already available."
  exit 0
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

$zipName = "$folderName.zip"
$zipPath = Join-Path $runtimeRoot $zipName
$url = "https://nodejs.org/download/release/v$version/$zipName"

Write-Host "[SP-API] Downloading official Node.js $version for this project..."
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zipPath

$actualHash = (Get-FileHash -Algorithm SHA256 -Path $zipPath).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  throw "Node.js download checksum did not match the official SHA-256."
}

if (Test-Path $nodeFolder) {
  Remove-Item $nodeFolder -Recurse -Force
}

Expand-Archive -Path $zipPath -DestinationPath $runtimeRoot -Force
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $nodeExe)) {
  throw "Node.js was downloaded but node.exe was not found after extraction."
}

Write-Host "[SP-API] Project-local Node.js $version is ready."
