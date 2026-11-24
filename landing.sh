#!/usr/bin/env bash
# Landing page edition of install.sh: the same setup (Node, pnpm, dependencies, build), then SparkBots starts in the background and the browser
# shows the LANDING page instead of the 3D office. The page has a button that opens your running session; it notices when SparkBots starts or stops.
#   ./landing.sh              install what is needed, start SparkBots, open the landing page (http://127.0.0.1:4380/)
#   ./landing.sh --no-open    do not open the browser (the address is printed)
#   ./landing.sh --port 4400  another port for the landing page
# Other options are the ones of install.sh (--skip-build, --yes, --check, --install-only). Everything stays on this machine, loopback only.
exec "$(cd "$(dirname "$0")" && pwd)/install.sh" --landing "$@"
