# SparkBots on Windows: install what is needed, build, start, and open the browser.
#   powershell -ExecutionPolicy Bypass -File .\install.ps1            install + build + start + open the page
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoOpen    do not open the browser
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dev       pnpm monitor (hot reload)
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -InstallOnly
#   -Tools claude,codex,opencode,ollama,llamacpp   (or all) also install those agent CLIs without asking
#   -NoTools                                       do not offer the agent CLIs
# Agent CLIs (optional): on a terminal each missing one is offered, asking first (default: no). Claude Code, Codex and OpenCode use
# `npm install -g` (@anthropic-ai/claude-code, @openai/codex, opencode-ai); Ollama and llama.cpp use winget (Ollama.Ollama, ggml.llamacpp).
param([switch]$NoOpen, [switch]$Dev, [switch]$SkipBuild, [switch]$InstallOnly, [switch]$Yes, [string]$Tools = "", [switch]$NoTools)
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

if (-not $NoTools) {
  $list = @(
    @{ n="claude";   b="claude";       l="Claude Code";            how="npm:@anthropic-ai/claude-code"; url="https://docs.claude.com/en/docs/claude-code" },
    @{ n="codex";    b="codex";        l="OpenAI Codex CLI";       how="npm:@openai/codex";             url="https://github.com/openai/codex" },
    @{ n="opencode"; b="opencode";     l="OpenCode";               how="npm:opencode-ai";               url="https://opencode.ai" },
    @{ n="ollama";   b="ollama";       l="Ollama (local models)";  how="winget:Ollama.Ollama";         url="https://ollama.com/download" },
    @{ n="llamacpp"; b="llama-server"; l="llama.cpp (local models)"; how="winget:ggml.llamacpp";       url="https://github.com/ggml-org/llama.cpp" }
  )
  $wanted = $Tools.Split(",") | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ }
  $interactive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
  foreach ($t in $list) {
    if (Has $t.b) { continue }
    $want = ($wanted -contains "all") -or ($wanted -contains $t.n)
    if (-not $want) {
      if ($wanted.Count -gt 0 -or $Yes -or -not $interactive) { continue }
      if ((Read-Host "Install $($t.l) (optional)? [y/N]") -ne "y") { continue }
    }
    if ($t.how.StartsWith("npm:")) { Say "Installing $($t.l): npm install -g $($t.how.Substring(4))"; npm install -g $t.how.Substring(4); if ($LASTEXITCODE -ne 0) { Write-Host "!! $($t.l): install failed. Manual: $($t.url)" -ForegroundColor Yellow } }
    elseif (Has winget) { Say "Installing $($t.l): winget install $($t.how.Substring(7))"; winget install $t.how.Substring(7) --accept-package-agreements --accept-source-agreements; if ($LASTEXITCODE -ne 0) { Write-Host "!! $($t.l): install failed. Manual: $($t.url)" -ForegroundColor Yellow } }
    else { Write-Host "!! $($t.l): winget not found. Download it from $($t.url)" -ForegroundColor Yellow }
  }
}

Say "Installing dependencies"
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { pnpm install }
if ((-not $SkipBuild) -or (-not (Test-Path dist/index.html))) { Say "Building"; pnpm build }
if ($InstallOnly) { Say "Done. Start it with:  pnpm start --open"; exit 0 }

Say "Starting SparkBots (Ctrl-C stops it)"
if ($Dev) { if ($NoOpen) { pnpm monitor --no-open } else { pnpm monitor } }
else { if ($NoOpen) { pnpm start } else { pnpm start --open } }
