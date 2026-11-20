# Agent Office — Task list

Tags: **[H]** Haiku (mechanical, spec is fully given by contract files) · **[S]** Sonnet (feature work) · **[O]** Opus (design/reasoning).
Contract: `server/adapters/types.ts` is the single source of truth. Haiku tasks implement against it and add a Vitest test.

## Phase 0 — Analysis & scaffold
- [x] [O] Inspect real `~/.claude` formats (sessions/*.json has pid, sessionId, cwd, kind, status; JSONL `assistant.message.usage`, `tool_use` blocks, `cwd` on records) — `[VERIFY]` resolved for this machine
- [x] [S] package.json, tsconfig, vite config, deps
- [x] [O] types contract (`server/adapters/types.ts`)

## Phase 1 — Data layer + 2D panels
- [x] [H] 1.1 `server/config.ts`: load/save `~/.agent-office/{config,teams,board,runs}.json` with `schemaVersion:1`, defaults, `AO_HOME` env override for tests
- [x] [H] 1.2 `server/security.ts`: token gen, Host/Origin/token check function + tests
- [x] [H] 1.3 `transcript.ts` pure `parseLine(line, session) → AgentEvent[]` + tool→activity map + fixtures + tests (corrupt line skipped)
- [x] [H] 1.4 `discover.ts`: walk projects dir, cwd from records, title, team merge by globs + tests
- [x] [H] 1.5 `stats/aggregate.ts` + `prices.json` + tests
- [x] [H] 1.6 `liveness.ts`: read `~/.claude/sessions/*.json`, validate PID alive
- [x] [O] 1.7 `model/state.ts`: worker state machine (§4.4), thresholds from config + tests
- [x] [S] 1.8 `transcript.ts` incremental tailer (byte offsets, chokidar) 
- [x] [S] 1.9 `server/index.ts` + `ws.ts`: Fastify, token auth, snapshot + diff push, static client
- [x] [H] 1.10 Client: zustand store + ws hook
- [x] [H] 1.11 Panels: Teams, Control Room, Stats (plain React)
- [x] [S] 1.12 App shell + main menu

## Phase 2 — Commands
- [x] [O] 2.1 `command.ts` safe spawn (arg array), per-session queue, terminal-live guard, run registry
- [x] [H] 2.2 API routes + Worker panel chat input/queue/stop/copy-terminal-cmd
- [x] [H] 2.3 Tests: shell-injection prompt literal, rejected send when live

## Phase 3 — 3D world (basic)
- [x] [S] 3.1 R3F scene: instanced desks per team, procedural bot, overview camera
- [x] [H] 3.2 State→color/animation mapping, menu "Go there"

## Phase 4 — Board + server room
- [x] [H] 4.1 board persistence + routes; Board panel (5 columns)
- [x] [S] 4.2 assign card → run; card follows run state, never auto-Done
- [x] [H] 4.3 Server Room panel (live PIDs)

## Phase 5 — Release
- [x] [H] 5.1 README, LICENSE (MIT), privacy statement

## Phase 6 — Finish-up (all done)
- [x] [O] 6.1 Hooks install/uninstall CLI (diff, confirm, backup, idempotent, marker) + `/hook` receiver with its own stable token + `hooked` state flag
- [x] [S] 6.2 Stats disk cache (`cache/stats.json`, size+mtime keyed; warm start ~1.4 s)
- [x] [S] 6.3 Settings panel + `/api/config`, `/api/teams` (validated; bypassPermissions rejected), `/api/hooks`
- [x] [S] 6.4 Walk-mode desk collision (`resolveMove`, tested)
- [x] [O] 6.5 Bug fix: run registry and board were saved without `.json` extension
- [x] [O] 6.6 Verified: 121 fps rAF with 100-worker fixture; live hook transitions; real `claude -p` accepts the argv form

## Phase 7 — Requests after release (done)
- [x] [S] 7.1 3D colors follow worker state (same palette as 2D badges); status legend with counts
- [x] [S] 7.2 Project legend (filter, state counts, click to jump) in the 3D view
- [x] [S] 7.3 Teams list: task badge from each project's task list file, ▶ Continue / ＋ New worker / ⏩ All phases buttons (dry-run + confirm, then send). `server/tasks.ts`, `/api/tasks`, `/api/teams/run`
- [x] [H→S] 7.4 `--open` flag, `pnpm open`, `pnpm monitor` (tsx watch + vite HMR, stable dev token)
- [x] [S] 7.5 Double-click a project area in overview -> walk mode there

- [x] [S] 7.6 Walk mode: mouse wheel zoom (scroll down = zoom out, 0.35x–8x of the follow distance)

- [x] [O] 7.7 Project labels (`server/labels.ts`, `labels.json`; defaults Current / Waiting on decision / Finished / Abandoned; custom labels; `onMap:false` hides a project from the 3D map, with a "show finished/abandoned" toggle). JSON file, not SQLite: spec says no DB and volume is tiny; Node 24 has `node:sqlite` if it ever grows.
- [x] [S] 7.8 Teams toolbar: search, status chips (with counts), label chips + Unlabeled, has-open-tasks, sort (latest / status priority / name / open tasks / workers), clear, N of M; persisted in localStorage
- [x] [S] 7.9 Teams: collapsed project rows with totals (working/live/sessions, prompts, tool calls, tokens, time worked, task progress bar), click to expand workers; per-session stats cached in stats.json; status "all / active" quick toggles
- [x] [S] 7.10 Rename to SparkBots; per-worker bot icon (original spark-bot SVG) with random stable default color + click-to-change (bots.json); "Show/Hide active workers" toggle for all projects
- [x] [S] 7.11 Blocky pixel-bot look in 2D icon and 3D bots (body + eye holes + arm bar + 4 legs); 3D body uses the user-picked color (ring still shows state); `pnpm dev` alias
- [x] [S] 7.12 Project-level bot color: the project icon (replaces the dot) opens a free color picker; recolors the project icon and all its robots in 3D (worker color > project color > default); bots.json `teams`
- [x] [H] 7.13 All bots default to Claude-Code orange (#d97757) until a color is picked (worker > project > default)
- [x] [S] 7.14 Control Room Live/History toggle: work spans (project, worker, activities, duration, waited) recorded server-side in history.json, project filter
- [x] [S] 7.15 Control Room: "Worked recently" (24h) cards + card footers with time / tokens / tool calls (this run and session totals)
- [x] [O] 7.16 3D room: chat in speech bubbles (E / click desk, no tab switch; live-in-terminal sessions fork instead), desk laptops with per-worker stats screen (open when busy, closed + status glow otherwise), bigger desks, bots wander (idle) / lie down (asleep) / run to desk on chat, click-to-move, manager color in Settings, project picker moved to header; /api/sessions/:id/messages
- [x] [S] 7.17 Speech bubbles above bots with an unseen assistant message (status-colored: needs you / finished / error / message), click opens chat, reading the chat or "Clear bubbles" marks seen (localStorage), 12h freshness window
- [x] [S] 7.18 Global filters in the app header (search, status, labels, open tasks, sort) shared via the store; applied to Teams, Control Room and the 3D office (only matching projects/workers get desks)
- [x] [S] 7.19 3D controls in the header (walk/overview, zoom in/out/reset, zoom lock, minimap with click-to-go); chat window can be floated or pinned left/right so it no longer covers the scene
- [x] [S] 7.20 Custom worker names (bots.json `names`, `PUT /api/bots/:id/name`); click the name in the chat header to rename, original session title shown under it; used in Teams, Control Room, laptop screens, search
- [x] [S] 7.21 Settings page: searchable options with hidden keywords + descriptions, section tabs with counts (General, 3D office, Worker states, Server, Projects), browser-side 3D options added; config saves on change
- [x] [S] 7.22 Board cards: "Send ▾" menu — message a free worker, fork any worker (also live-in-terminal ones), or new robot in the project; team tool/permission overrides now apply to card runs
- [x] [S] 7.23 Bots no longer walk through each other or the manager (`world/roam.ts` separation); Z zaps the closest robot (lightning, sparks, shake/hop/spin, wakes sleepers) — key bindings live in `world/actions.ts` so more actions can be added

## Notes
- Haiku returned `model_not_found` in this environment (default model alias there is `beam-free`); delegated tasks ran on Sonnet. Re-tag Haiku when available. Office runs inherit the user's default model, so they fail the same way if that alias is broken.
- Hook event names/payload fields verified against Claude Code 2.1.328 settings + docs on this machine only (`[VERIFY]` on upgrade).
- Not verified: a full successful real run end-to-end (the only real call errored on the model alias); wave/animation visuals beyond a static screenshot.
