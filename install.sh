#!/usr/bin/env bash
# SparkBots: install what is needed, build, start, and open the browser.  (macOS and Linux; Windows: install.ps1)
#
#   ./install.sh               install + build + start, and open the page
#   ./install.sh --dev         the same, but with `pnpm monitor` (server restarts on code changes, client hot reload)
#   ./install.sh --no-open     do not open the browser (the page address is printed)
#   ./install.sh --skip-build  reuse the existing build (faster)
#   ./install.sh --install-only  install and build, do not start
#   ./install.sh --check       only report what is installed; changes nothing
#   ./install.sh --yes         do not ask before installing Node (needs Homebrew or nvm)
#   ./install.sh --landing     the same setup, but SparkBots starts in the background and the browser shows the LANDING page, with a button
#                              that opens your running session (this is what ./landing.sh does; --port N picks the landing page port, default 4380)
#
#   --tools LIST             also install agent CLIs without asking. LIST = claude,codex,opencode,ollama,llamacpp or all (see below)
#   --no-tools               do not offer the agent CLIs
#
# Agent CLIs (optional): SparkBots shows the sessions of Claude Code, Codex and OpenCode, and lists local AI servers (Ollama, llama.cpp).
# On a terminal the script offers each one that is missing, and asks first (default: no). Claude Code, Codex and OpenCode are installed with
# `npm install -g` (@anthropic-ai/claude-code, @openai/codex, opencode-ai); Ollama and llama.cpp with Homebrew when it exists, else the
# download page is printed. Nothing is piped from the web into a shell. Skip with --no-tools. Run each tool once to sign in.
#
# Nothing here touches ~/.claude or anything outside this folder, except installing Node / pnpm when they are missing (and you say yes).
set -euo pipefail
cd "$(dirname "$0")"

YES=0 OPEN=1 DEV=0 BUILD=1 START=1 CHECK=0 LANDING=0 LPORT=4380 TOOLS= NOTOOLS=0
while [ $# -gt 0 ]; do
  a="$1"; shift
  case "$a" in
    --landing) LANDING=1 ;;
    --port) LPORT="${1:?--port needs a number}"; shift ;;
    --tools) TOOLS="${1:?--tools needs a list, e.g. claude,codex or all}"; shift ;;
    --no-tools) NOTOOLS=1 ;;
    --yes|-y) YES=1 ;;
    --no-open) OPEN=0 ;;
    --dev) DEV=1 ;;
    --skip-build) BUILD=0 ;;
    --install-only) START=0 ;;
    --check) CHECK=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $a (see --help)"; exit 2 ;;
  esac
done

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*"; }
die()  { printf '\033[1;31mxx\033[0m  %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
ask()  { [ "$YES" = 1 ] && return 0; [ -t 0 ] || return 1; printf '%s [y/N] ' "$1"; read -r r; [ "$r" = y ] || [ "$r" = Y ]; }

MIN_MAJOR=22 MIN_MINOR=13   # node:sqlite works without a flag from 22.13; Node 24 is what SparkBots is developed on
node_ok() {
  have node || return 1
  local v major minor
  v="$(node -p 'process.versions.node')"; major="${v%%.*}"; minor="${v#*.}"; minor="${minor%%.*}"
  [ "$major" -gt "$MIN_MAJOR" ] || { [ "$major" -eq "$MIN_MAJOR" ] && [ "$minor" -ge "$MIN_MINOR" ]; }
}

say "SparkBots setup in $(pwd)"
if node_ok; then say "Node $(node -v): ok"; else warn "Node ${MIN_MAJOR}.${MIN_MINOR}+ is needed (Node 24 recommended); found: $(have node && node -v || echo none)"; fi
if have pnpm; then say "pnpm $(pnpm -v): ok"; else warn "pnpm is not installed"; fi
if [ "$CHECK" = 1 ]; then
  have git && say "git: ok" || warn "git: missing (only needed to update)"
  [ -d node_modules ] && say "dependencies: installed" || warn "dependencies: not installed (run ./install.sh)"
  [ -f dist/index.html ] && say "build: present" || warn "build: missing"
  for t in claude codex opencode ollama llama-server; do have "$t" && say "$t: installed" || warn "$t: not installed (optional)"; done
  exit 0
fi

# ---- Node ----
if ! node_ok; then
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    ask "Install Node 24 with nvm?" || die "Node is required. Install Node 24 (https://nodejs.org) and run this again."
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"; nvm install 24; nvm use 24
  elif have brew; then
    ask "Install Node with Homebrew (brew install node)?" || die "Node is required. Install Node 24 (https://nodejs.org) and run this again."
    brew install node
  else
    die "Node ${MIN_MAJOR}.${MIN_MINOR}+ is required. Install Node 24 from https://nodejs.org (or with nvm / your package manager) and run ./install.sh again."
  fi
  node_ok || die "Node is still too old or not on the PATH. Open a new terminal and run ./install.sh again."
  say "Node $(node -v): ok"
fi

# ---- pnpm ----
if ! have pnpm; then
  say "Installing pnpm"
  if have corepack; then corepack enable >/dev/null 2>&1 && corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true; fi
  have pnpm || npm install -g pnpm || die "Could not install pnpm. Try: npm install -g pnpm   (or see https://pnpm.io/installation)"
  say "pnpm $(pnpm -v): ok"
fi

# ---- optional agent CLIs ----
# name|binary|label|npm package or brew formula|manual download page
TOOL_LIST="claude|claude|Claude Code|npm:@anthropic-ai/claude-code|https://docs.claude.com/en/docs/claude-code
codex|codex|OpenAI Codex CLI|npm:@openai/codex|https://github.com/openai/codex
opencode|opencode|OpenCode|npm:opencode-ai|https://opencode.ai
ollama|ollama|Ollama (local models)|brew:ollama|https://ollama.com/download
llamacpp|llama-server|llama.cpp (local models)|brew:llama.cpp|https://github.com/ggml-org/llama.cpp"
install_tool() {
  local name="$1" bin="$2" label="$3" how="$4" url="$5"
  have "$bin" && return 0
  local want=0
  case ",${TOOLS}," in *",all,"*|*",${name},"*) want=1 ;; esac
  if [ "$want" = 0 ]; then
    [ -n "$TOOLS" ] && return 0            # an explicit list: only those
    ask "Install ${label} (optional)?" || return 0
  fi
  case "$how" in
    npm:*) say "Installing ${label}: npm install -g ${how#npm:}"; npm install -g "${how#npm:}" || warn "${label}: install failed (npm global needs permission here). Manual: ${url}" ;;
    brew:*) if have brew; then say "Installing ${label}: brew install ${how#brew:}"; brew install "${how#brew:}" || warn "${label}: install failed. Manual: ${url}"; else warn "${label}: Homebrew not found. Download it from ${url}"; fi ;;
  esac
}
if [ "$NOTOOLS" = 0 ]; then
  # without --tools, ask only on a terminal and never with --yes alone (--yes covers Node, not extra software)
  if [ -n "$TOOLS" ] || { [ "$YES" = 0 ] && [ -t 0 ]; }; then
    while IFS='|' read -r n b l h u; do install_tool "$n" "$b" "$l" "$h" "$u"; done <<EOF_TOOLS
$TOOL_LIST
EOF_TOOLS
  fi
fi

# ---- dependencies and build ----
say "Installing dependencies"
pnpm install --frozen-lockfile || pnpm install
if [ "$BUILD" = 1 ] || [ ! -f dist/index.html ]; then say "Building"; pnpm build; else say "Using the existing build (--skip-build)"; fi

[ "$START" = 1 ] || { say "Done. Start it with:  pnpm start --open"; exit 0; }

# ---- run ----
if [ "$LANDING" = 1 ]; then
  SB_PORT="${AO_PORT:-4317}"
  if curl -s -o /dev/null -m 1 "http://127.0.0.1:${SB_PORT}/" 2>/dev/null; then
    say "SparkBots is already running on port ${SB_PORT}: the landing page will link to it"
  else
    say "Starting SparkBots in the background"
    pnpm start &
    SB_PID=$!
    trap 'kill "$SB_PID" 2>/dev/null || true' EXIT INT TERM
    for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null -m 1 "http://127.0.0.1:${SB_PORT}/" 2>/dev/null && break; sleep 1; done
  fi
  say "Landing page on http://127.0.0.1:${LPORT}/ (Ctrl-C stops everything it started)"
  if [ "$OPEN" = 1 ]; then node scripts/landing-server.mjs --port "$LPORT" --open; else node scripts/landing-server.mjs --port "$LPORT"; fi
  exit 0
fi
say "Starting SparkBots (Ctrl-C stops it)"
if [ "$DEV" = 1 ]; then
  if [ "$OPEN" = 1 ]; then exec pnpm monitor; else exec pnpm monitor --no-open; fi   # in the terminal press  o  to open the page again
else
  if [ "$OPEN" = 1 ]; then exec pnpm start --open; else exec pnpm start; fi
fi
