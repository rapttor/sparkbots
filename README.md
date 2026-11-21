# SparkBots

A local, browser-based "office" for your Claude Code, Codex and OpenCode history: every session is a worker, every project is a team. See who is working, who is waiting on you, token usage, and (carefully) send prompts to a session.

## Run

```bash
pnpm install
pnpm build
pnpm start     # prints http://127.0.0.1:4317/?t=<token>
```

| Command | What it does |
|---|---|
| `pnpm start` | Start the server (serves the built client). Add `--open` to open the browser: `pnpm start --open`. |
| `pnpm open` | Same as `pnpm start --open`. |
| `pnpm dev` | Alias of `pnpm monitor` (below). |
| `pnpm monitor` | Watch mode: server restarts on code changes, client hot-reloads (Vite), browser opens once. Uses a persisted token (`~/.agent-office/dev-token`, 0600) so the open tab survives restarts. `--no-open` skips the browser. |

The 3D view: double-click a project area to walk into it; the legends (status colors, project list with filter) jump the camera. Test with fake workers: add `&fixture=100` to the URL.

## Privacy

Nothing leaves your machine. The server binds to `127.0.0.1` only, requires a random token on every request, rejects foreign `Host`/`Origin` headers, makes no external requests and sends no telemetry. It only **reads** `~/.claude/`, `~/.codex/` and the local OpenCode SQLite database (`~/.local/share/opencode/opencode.db`, read-only); its own files live in `~/.agent-office/`. Message previews can be hidden with `streamingMode` in `config.json`.

## Safety

- Prompts are passed to `claude -p --resume <id>`, the Codex queue, or `opencode run --session <id>` as argv entries (no shell).
- A session open in an interactive terminal cannot be written to (fork instead; OpenCode plain sends are refused while an OpenCode TUI is running in that project).
- One run per session at a time; extra messages are queued.
- `bypassPermissions` / `--dangerously-skip-permissions` are never used.
- Stop only signals processes the office itself spawned.

## Config (`~/.agent-office/`)

`config.json`, `teams.json` (directory globs -> team merges, colors, per-team `allowedTools`/`permissionMode`), `board.json`, `runs.json`.

## Notes

Claude Code, Codex and OpenCode on-disk formats are not a public API; parsers skip unknown/corrupt lines and count them. Cost figures are estimates from `server/stats/prices.json`. 
## Optional hooks (more precise state)

```bash
pnpm start hooks install     # shows a diff, asks to confirm, backs up settings.json first
pnpm start hooks uninstall   # removes exactly the entries it added
```

Adds `curl` hooks (SessionStart, UserPromptSubmit, PreToolUse, Notification, Stop, SubagentStop, SessionEnd) to `~/.claude/settings.json` that POST to `127.0.0.1` with a separate stable token (`~/.agent-office/hook-token`, mode 0600). Backups go to `~/.agent-office/backups/`. The app works fully without hooks; without them state lags by up to ~15 s.


MIT licensed. The bot mascot is an original design.
