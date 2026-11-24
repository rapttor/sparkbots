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
#
# Nothing here touches ~/.claude or anything outside this folder, except installing Node / pnpm when they are missing (and you say yes).
set -euo pipefail
cd "$(dirname "$0")"

YES=0 OPEN=1 DEV=0 BUILD=1 START=1 CHECK=0
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --no-open) OPEN=0 ;;
    --dev) DEV=1 ;;
    --skip-build) BUILD=0 ;;
    --install-only) START=0 ;;
    --check) CHECK=1 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# ---- dependencies and build ----
say "Installing dependencies"
pnpm install --frozen-lockfile || pnpm install
if [ "$BUILD" = 1 ] || [ ! -f dist/index.html ]; then say "Building"; pnpm build; else say "Using the existing build (--skip-build)"; fi

[ "$START" = 1 ] || { say "Done. Start it with:  pnpm start --open"; exit 0; }

# ---- run ----
say "Starting SparkBots (Ctrl-C stops it)"
if [ "$DEV" = 1 ]; then
  if [ "$OPEN" = 1 ]; then exec pnpm monitor; else exec pnpm monitor --no-open; fi   # in the terminal press  o  to open the page again
else
  if [ "$OPEN" = 1 ]; then exec pnpm start --open; else exec pnpm start; fi
fi
