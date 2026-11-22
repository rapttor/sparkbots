# CLAUDE.md — SparkBots (formerly "Agent Office")

A local, browser-based 3D "company" where every Claude Code session is a worker, every project is a team, and you can walk up to a desk and talk to the agent sitting there. Personal tool first, open-source (MIT) second.

> The product name is SparkBots (set in `src/shared/brand.ts`; do not hardcode it elsewhere). The data folder `~/.agent-office/` and the `agent-office` CLI name are kept for compatibility. Terms: an *agent* is one session/chat; a *sub-agent* is started by an agent (shown as a minibot of its parent).

---

## 0. Ground rules for any session working on this repo

- **This is a local tool, not a cPanel product.** The usual Yii2/cPanel constraint does not apply. Node + TypeScript, runs on the user's machine, binds to `127.0.0.1` only.
- **Read-only by default.** The app reads `~/.claude/`. It never edits, moves or deletes anything there. The only writes to the user's machine are inside `~/.agent-office/`, plus the optional hooks install (§6), which backs up the file it changes.
- **No `--dangerously-skip-permissions`, ever.** Nothing the office spawns may bypass Claude Code permissions. This is a hard rule, not a default.
- **Undocumented formats get `[VERIFY]`.** Claude Code's on-disk formats (`~/.claude/sessions/`, JSONL record shapes) are not a public API. Every parser is defensive: unknown fields are ignored, unparseable lines are skipped and counted, and nothing crashes the server.
- **Original mascot only.** Workers are an original low-poly "spark bot" design. No Claude/Anthropic logo, wordmark or likeness anywhere in the repo, assets or screenshots (trademark; required for open source).
- **Scope discipline.** Work is tracked in `docs/TASKS.md`: phases 1-12 and 14 are done apart from small leftovers (12.1 cleanup), Phase 13 (backlog) is mostly done (open: 13.1.4/5/8/9, 13.4.3/4/8, 13.7.7-10, deferred sync 13.0.3-6), and 7.41 c/d (live approval, slash commands) is open. Keep the task list updated when work is planned or finished.

---

## 1. What it is

| Concept in the office | Real thing |
|---|---|
| Company | Your machine's Claude Code history (`~/.claude/projects/`) |
| Team / department | A project = one working directory (cwd). Several directories can be merged into one team via config. |
| Worker (bot at a desk) | One Claude Code session (one `<session-id>.jsonl`) |
| Helper mini-bot | A subagent spawned by a session (Agent/Task tool) |
| Worker state | Derived from live process + recent transcript/hook activity (§4) |
| Talking to a worker | Sending a prompt to that session via headless resume (§5) |
| Control room | Live view of all working/waiting workers, grouped by team |
| Wall monitor | Usage stats from transcripts: tokens, sessions, activity per project/day |
| Server room | Live processes: running `claude` PIDs, office-spawned runs, MCP servers per project (Phase 4) |
| Task board | Kanban across all projects, cards can be assigned to a worker |
| Main menu | Every room is also a 2D panel. Walking is optional, never required. |

---

## 2. Stack

- **Runtime:** Node 20+, TypeScript (strict), pnpm.
- **Server:** Fastify, `ws` for WebSocket push, `chokidar` for file watching, `pidusage` (or `ps` parsing) for process stats.
- **Client:** Vite + React 18 + React Three Fiber + drei. Zustand for client state. Panels are plain React (no 3D needed to use any feature).
- **Storage:** JSON files in `~/.agent-office/` (config, board, aliases, spawned-run registry) plus one SQLite file `~/.agent-office/app.db` (`server/db.ts`, numbered migrations) for data SparkBots generates and keeps forever: usage history, rack aliases, caffeine, game results.
- **Distribution:** `npx agent-office` (placeholder name) starts the server and opens the browser.
- **Tests:** Vitest. Fixture JSONL files under `test/fixtures/` (anonymized, hand-written, never copied from real sessions).

### Repo layout

```
/
├── package.json
├── CLAUDE.md
├── server/
│   ├── index.ts            # Fastify boot, bind 127.0.0.1, token auth
│   ├── adapters/
│   │   ├── types.ts        # AgentAdapter interface (§3)
│   │   └── claude-code/
│   │       ├── discover.ts # walk ~/.claude/projects
│   │       ├── transcript.ts  # incremental JSONL tail + parse
│   │       ├── liveness.ts    # PID / sessions-dir detection [VERIFY]
│   │       ├── hooks.ts       # optional hook event receiver
│   │       └── command.ts     # headless resume / spawn (§5)
│   ├── model/              # Company, Team, Worker, state machine
│   ├── stats/              # token + activity aggregation
│   ├── board/              # kanban persistence
│   └── ws.ts               # snapshot + diff push
├── src/                    # client
│   ├── panels/             # 2D: Teams, Control Room, Stats, Board, Server Room, Worker
│   ├── world/              # 3D: floor plan, desks, bots, camera, walking
│   ├── state/              # zustand store fed by ws
│   └── shared/brand.ts
└── test/fixtures/
```

---

## 3. Adapter interface (multi-agent later, Claude Code now)

Everything agent-specific lives behind one interface so Codex/Gemini/etc. can be added later without touching the world or panels.

```ts
interface AgentAdapter {
  id: string;                          // "claude-code"
  discover(): Promise<SessionRef[]>;   // all known sessions
  watch(onEvent: (e: AgentEvent) => void): () => void;
  liveness(): Promise<Map<SessionId, LiveInfo>>;
  send?(session: SessionId, prompt: string, opts: SendOpts): RunHandle; // optional capability
  spawn?(cwd: string, prompt: string, opts: SendOpts): RunHandle;       // optional capability
}

type AgentEvent =
  | { kind: "tool"; session; tool: string; target?: string; at }
  | { kind: "turn_start" | "turn_end"; session; at }
  | { kind: "message"; session; role: "user" | "assistant"; preview: string; at }
  | { kind: "usage"; session; model: string; input: number; output: number; cacheRead: number; cacheWrite: number; at }
  | { kind: "permission_wait"; session; at }
  | { kind: "subagent"; session; childId: string; state: "start" | "end"; at }
  | { kind: "error"; session; message: string; at };
```

Claude Code, Codex and OpenCode have session adapters (`server/adapters/`). OpenCode is read-only toward its SQLite chat database and mirrors new rows into a JSONL cache in `~/.agent-office/cache/opencode/`. Other AI servers (Ollama, LM Studio, llama.cpp, ...) are tracked as *services* (`server/services/`: probe, scan, registry; the Services panel), at the user's request: they are listed with status and loaded models, not as session workers. Scanning beyond localhost only runs when the user types a range.

---

## 4. Claude Code data layer

### 4.1 Discovery

- Sessions: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
- Project cwd: read it from the transcript records (`cwd` field) rather than decoding the folder name. The folder-name encoding loses information. Fall back to decoding only if no record has a `cwd`. `[VERIFY]` field name against real files.
- Session title: first real user message, trimmed to 60 chars, or a summary record if present. `[VERIFY]`.
- Team merge: `~/.agent-office/teams.json` maps directory globs to team names, e.g. `{ "Vibe/Dolazis": ["/Volumes/m2/Vibe/dolazis*"] }`. Unmapped cwds get their own team named after the last path segment.

### 4.2 Transcript tailing

- Tail each JSONL incrementally (keep byte offsets in memory). Never re-read whole files on change.
- On first start, parse only the last N KB of each file to set initial state. Full history parsing for stats runs lazily in the background and caches results in `~/.agent-office/cache/stats.json`, keyed by file + size + mtime.
- Map records to `AgentEvent`s. Tool names map to activity labels:

| Tool(s) | Activity | Bot animation |
|---|---|---|
| Read, Grep, Glob, WebSearch, WebFetch | researching | reading hologram |
| Edit, Write, NotebookEdit | coding | typing fast |
| Bash (test runners) | testing | flask / sparks |
| Bash (git push, deploy scripts) | shipping | box carry |
| Bash (other) | running | terminal glow |
| Agent / Task | delegating | spawns helper mini-bot |
| TodoWrite / plan tools | planning | whiteboard |
| none for > idle threshold | idle | slow bob |

### 4.3 Liveness

Source priority, highest first:
1. **Hook events** (if hooks installed, §6): exact turn start/stop, permission waits, subagent stop.
2. **Office-spawned runs**: the office owns the child process, so it knows the exact state.
3. **Session/PID files** in `~/.claude/sessions/` with PID validation. `[VERIFY]` the existence and shape on the current Claude Code version, and degrade gracefully if absent.
4. **Transcript mtime heuristic**: modified < 15 s ago means working.

### 4.4 Worker state machine

```
asleep  ──(process alive)──▶ idle ──(turn_start / tool)──▶ working
   ▲                          ▲  ◀──(turn_end)──────────────┘
   │                          │
   └──(no process & quiet > 10 min)                working ──(permission_wait)──▶ waiting
                                                    working ──(error)──▶ error (2 min, then idle)
turn_end ──▶ done (wave animation 5 s) ──▶ idle
```

- **asleep**: no live process. Bot sits with eyes closed and Zzz. This is the normal state for most of the history.
- **waiting**: needs a human (permission prompt / question). Highest visual priority: pulsing amber beacon above the desk, listed at the top of the Control Room.
- Thresholds live in config, not code.

### 4.5 Stats (wall monitor)

From `usage` events in transcripts:
- Tokens by day / project / model (input, output, cache read, cache write).
- Sessions started per day, active hours heatmap, top projects this week.
- An **estimated** API-equivalent cost, labeled "estimate". The price table lives in `server/stats/prices.json` with a `lastChecked` date shown on the monitor.
- **Not in scope:** subscription plan limits or remaining quota. That isn't in local files. Don't fake it.

---

## 5. Talking to workers (commands)

This is the core feature the existing visualizers don't do well. Get it right before adding polish.

### 5.1 Mechanism

Uses documented headless mode only:
- Continue an existing session: `claude -p --resume <session-id> --output-format stream-json --verbose "<prompt>"`, run with `cwd` = the session's project dir.
- New worker at a team's desk: `claude -p --output-format stream-json --verbose "<prompt>"` in that cwd. Read `session_id` from the stream and register it.
- Stream events are parsed live into the worker's chat panel and animations.
- Spawn with `child_process.spawn` and an argument array. Never build a shell string, so prompts can't inject shell.

### 5.2 Safety rules (non-negotiable)

1. **Never send to a session that is open in an interactive terminal.** If liveness says an interactive process holds the session, the desk shows "Live in terminal" and the input is disabled, with a "Fork to new worker" button (`--resume <id> --fork-session`). Two writers on one transcript corrupt context.
2. **One run per session at a time.** Further messages are queued (visible queue on the desk). They're not sent in parallel.
3. **Permissions:** runs inherit the project's `.claude/settings.json`. The office adds nothing permissive. Per-team optional `allowedTools` / `permissionMode` overrides live in `~/.agent-office/teams.json`, and the UI shows them on the desk. Default permission mode is the user's default. Never `bypassPermissions`.
4. **Denied/blocked tools** show up as a "waiting" state with the reason. The user resolves them by opening the terminal (button copies `cd <cwd> && claude --resume <id>`) or by adjusting team overrides.
5. **Stop button** sends SIGTERM to the office-owned child only. Never kill processes the office didn't spawn.
6. **Run registry** persisted to `~/.agent-office/runs.json` so a server restart shows orphaned runs instead of silently losing them.

### 5.3 Board → worker

A kanban card can be "assigned" to a worker (existing session) or to a team (spawns a new worker). Assigning sends the card title + description as the prompt, links the card to the run, and moves it to "In progress". The card moves to "Review" when the turn ends. It never moves to "Done" automatically.

---

## 6. Optional hooks install

- `agent-office hooks install` adds hook entries to `~/.claude/settings.json` that POST events to `http://127.0.0.1:<port>/hook` with the local token.
- Before writing, copy the file to `~/.agent-office/backups/settings.<timestamp>.json`, then show a diff and require confirmation.
- `agent-office hooks uninstall` removes exactly the entries it added (tagged with a marker) and nothing else.
- The app must work fully without hooks. Hooks only make the state more precise.
- `[VERIFY]` current hook event names and payload shape against Claude Code docs at implementation time.

---

## 7. Security (local server that can run agents)

The server can start `claude` processes, so treat it as sensitive even on localhost.

- Bind `127.0.0.1` only. No `0.0.0.0` option in v1.
- Random token generated at start, passed in the opened URL (`?t=`) and required on every HTTP/WS request.
- Reject requests whose `Host` isn't `127.0.0.1:<port>` / `localhost:<port>` (DNS rebinding) and whose `Origin` isn't the app's own (CSRF from other sites).
- Transcript content is shown only in the client. Nothing is sent anywhere. No telemetry, no external requests at all except optional asset CDN (prefer bundled assets).
- Message previews in the 3D world (speech bubbles) are truncated and can be turned off entirely (screen-sharing / streaming mode).

---

## 8. The world (3D)

### 8.1 Floor plan (single floor)

- **Team area per project:** a cluster of desks. Desk count = sessions shown (default: sessions active in the last 14 days, plus all live ones). Older sessions go into a "Archive" filing cabinet you can open. Don't render hundreds of desks.
- **Control room:** glass room with a wall of screens, one tile per working/waiting worker, grouped by team.
- **Stats wall:** a large monitor on the main wall rendering the §4.5 charts (render charts to canvas texture, refresh ≤ every 10 s).
- **Task board wall:** the kanban as a physical board. Clicking it opens the full 2D board panel.
- **Server room (Phase 4):** racks = live processes. Blinking LEDs scale with CPU, one rack per office-spawned run, MCP servers listed per project.
- Layout is generated from data (teams sorted by recent activity) with a deterministic seed so desks don't jump around between reloads.

### 8.2 Workers

- Original low-poly "spark bot": rounded body, single glowing visor, small antenna. Built procedurally in code (no external model needed for v1). Team color on the visor ring.
- Animations per §4.2 table + states per §4.4. Asleep is the default and must be cheap (no per-frame work).
- Helper mini-bots for subagents orbit the parent's desk and despawn on subagent end.

### 8.3 Navigation

- Third-person walking (WASD + click-to-move) **and** a top-down overview camera. Toggle with one key.
- Walk up to a desk: proximity prompt, press E to open the worker panel (chat history preview, current activity, input box, queue, stop, open-in-terminal).
- **Main menu (Esc / ☰):** Teams, Control Room, Stats, Board, Server Room, Settings. Every one opens as a 2D panel over the scene, and "Go there" flies the camera to it.

### 8.4 Performance budget

- 60 fps on an M-series MacBook with 100 visible workers.
- Instanced meshes for desks and bots, one shared material set, no shadows on asleep bots.
- The scene pauses rendering when the tab is hidden.

---

## 9. Phases and acceptance checks

### Phase 1 — Data layer + 2D panels (no 3D)
- Discover all sessions, group into teams, live state machine, stats aggregation, WebSocket push.
- Panels: Teams list → workers with state, Control Room list, Stats charts.
- ✅ Start/stop a Claude Code session in a terminal and the panel shows asleep → idle → working → done → idle within 3 s (with hooks) or 15 s (without).
- ✅ Corrupt line injected into a fixture JSONL is skipped and counted, server keeps running.
- ✅ Server refuses requests without token, with wrong Host, or with a foreign Origin.

### Phase 2 — Commands
- Desk chat via headless resume, new worker spawn, queue, stop, run registry, fork-to-new-worker.
- ✅ Sending to a session that is live in a terminal is impossible from the UI and rejected by the API.
- ✅ A prompt containing `"; rm -rf ~` reaches Claude as literal text (no shell involved).
- ✅ Server restart mid-run shows the run as orphaned with its PID.

### Phase 3 — 3D world
- Floor plan, bots with state animations, walking + overview camera, desk interaction, stats wall, control room screens.
- ✅ Every action available in 3D is also reachable from the main menu without walking.
- ✅ Performance budget met with a generated 100-worker fixture.

### Phase 4 — Board + server room
- Kanban (columns: Backlog, Ready, In progress, Review, Done), filter by team, assign to worker/team (§5.3).
- Server room process view.
- ✅ Assigning a card starts a run and the card follows the run's state; it never auto-moves to Done.

### Phase 5 — Open-source release
- README with screenshots (original mascot only), MIT LICENSE, `npx` install, hooks install/uninstall docs, privacy statement ("nothing leaves your machine").
- Second adapter only after release, if ever.

---

## 10. Prior art (read for ideas, don't copy code without checking the license)

- **pixel-agents** (pablodelucca) — MIT. VS Code extension + standalone browser CLI, JSONL watching, hooks, subagents. Good reference for transcript parsing; if any code is reused, keep its MIT notice.
- **agents-office** (cernadasjuan) — Three.js, reads `~/.claude/sessions/`. **No license file → do not copy code**, ideas only.
- **Pixel Agent Desk, Claude Office Visualizer, Inference Inc. (ccworkspace), Claw3D, Mindwalk** — check UX ideas, especially Claw3D for agent commanding from the office.

Our difference: project-as-team grouping across all sessions, safe two-way commanding, cross-project board wired to workers, and a full 2D menu so the 3D world is a pleasure, not a requirement.

---

## 11. Config files (`~/.agent-office/`)

| File | Purpose |
|---|---|
| `config.json` | port, thresholds, history window (days), streaming mode, render quality |
| `teams.json` | directory → team merges, team colors, per-team `allowedTools` / `permissionMode` |
| `board.json` | kanban cards (id, title, body, team, column, linked session/run, timestamps) |
| `runs.json` | office-spawned run registry |
| `cache/` | stats cache, OpenCode/Codex mirrors |
| `app.db` | SQLite: usage history (hourly, forever), rack aliases, caffeine, game results; schema by `PRAGMA user_version` |
| `backups/` | settings.json backups from hooks install |

All files are versioned (`"schemaVersion": 1`) and migrated on load.
