# SparkBots on Windows: install what is needed, build, start, and open the browser.
#   powershell -ExecutionPolicy Bypass -File .\install.ps1            install + build + start + open the page
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoOpen    do not open the browser
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev       pnpm monitor (hot reload)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -InstallOnly
param([switch]$NoOpen, [switch]$Dev, [switch]$SkipBuild, [switch]$InstallOnly, [switch]$Yes)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
function Say($m) { Write-Host "==> $m" -ForegroundColor Green }
function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

function NodeOk {
  if (-not (Has node)) { return $false }
  $v = [version]((node -p "process.versions.node").Trim())
  return ($v.Major -gt 22) -or ($v.Major -eq 22 -and $v.Minor -ge 13)
}

if (-not (NodeOk)) {
  if (Has winget) {
    if ($Yes -or (Read-Host "Node 22.13+ is needed. Install Node.js LTS with winget? [y/N]") -eq "y") {
      winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
      Write-Host "Node was installed. Open a NEW terminal and run this script again so the PATH is updated."; exit 0
    }
  }
  throw "Node 22.13+ is required (Node 24 recommended). Install it from https://nodejs.org and run this script again."
}
Say "Node $(node -v): ok"

if (-not (Has pnpm)) {
  Say "Installing pnpm"
  if (Has corepack) { try { corepack enable; corepack prepare pnpm@latest --activate } catch { } }
  if (-not (Has pnpm)) { npm install -g pnpm }
}
Say "pnpm $(pnpm -v): ok"

Say "Installing dependencies"
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { pnpm install }
if ((-not $SkipBuild) -or (-not (Test-Path dist/index.html))) { Say "Building"; pnpm build }
if ($InstallOnly) { Say "Done. Start it with:  pnpm start --open"; exit 0 }

Say "Starting SparkBots (Ctrl-C stops it)"
if ($Dev) { if ($NoOpen) { pnpm monitor --no-open } else { pnpm monitor } }
else { if ($NoOpen) { pnpm start } else { pnpm start --open } }
