# SparkBots — Task list (formerly "Agent Office"; the data folder is still `~/.agent-office/`)

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
- [x] [S] 7.24 Walk cycle: legs are separate parts swinging in diagonal pairs, hands seesaw, body bobs (bots and the manager); speech bubbles show up to 6 lines, chat messages scroll when long (first slice of 9.3)
- [x] [S] 7.25 Walk view angle (right-drag, or header buttons ↶ ↷ ⤒ ⤓; WASD moves relative to the camera); minimap = project boxes with names + agent counts; speech bubbles grow with their text (1-6 lines)
- [x] [H] 7.26 Show run problems in the chat: stream lines `{type:"system",subtype:"api_retry",attempt,max_retries,error_status,error}` appear as a status row ("Authentication failed (401), retry 3/10") with the Stop button; files `src/world/WorkerChat.tsx`, `server/adapters/claude-code/command.ts` (keep the retry lines in the run log); test with a fake stream in `test/command.test.ts`
- [x] [S] 7.27 Settings > "Claude runs": (a) model for runs (`--model`, empty = Claude Code default) and a "Test run" button that sends `say hello` and shows the result or the error; (b) "Clean environment" toggle: spawn `claude` without `ANTHROPIC_*` variables inherited from the server's shell (off by default; explained in the description); (c) read-only line showing which gateway host and model the next run will use (host name only, never tokens). Files: `server/adapters/claude-code/command.ts` (`buildArgs`, spawn env), `server/config.ts`, `src/panels/Settings.tsx`, test in `test/command.test.ts` — **done:** Settings > Claude runs: model for runs, clean environment toggle, Test run + which gateway/model is used (`/api/claude-setup`, `/api/test-run`)
- [x] [S] 7.28 Model switch in the chat: a Model box (default, opus, sonnet, haiku, or any model id) next to the message input, remembered per agent; sent as `--model` (validated, never flag-like) on send and on new worker
- [x] [H] 7.29 Minimap moved to the bottom of the left sidebar (170px, crisp on retina; floats in the scene if the sidebar is hidden)
- [x] [S] 7.30 One "View" button in the header opens a panel: zoom in/out + lock, pan (overview), angle (turn/tilt in overview and walk), reset view, minimap toggle; the Walk/Overview switch stays next to it
- [x] [S] 7.31 Click an agent (desk or robot) -> popup menu: Talk, Actions (list), Show as... (visual status override, Idle > wander / sit), quick Continue / Pause / Status (detail bubble); keymap legend in the 3D view where every executable entry is a button (greyed with the reason when not possible), Settings > Keymap (show toggle + full list), keys M / L / 0 / Esc added

## Phase 8 — Incremental sync (replaces "full snapshot + many pollers")
Idea: one monotonic `rev` on the server. Small things are pushed as patches; big or rare things are a tiny "changed" ping, then the client fetches only that slice.
- [x] [O] 8.1 Design `docs/SYNC.md`: entity kinds (worker, team meta, labels, stats, board, runs, tasks, history, processes, chat messages), message types (`hello{rev}`, `patch{rev,ops}`, `changed{kind,id?,rev}`), gap/reconnect rule (client rev too old -> full resync), what is inline vs ping+fetch
- [x] [S] 8.2 Server `ChangeLog` (ring buffer ~1000 entries, per-entity hash so unchanged workers produce no patch); `company` emits worker/team patches instead of whole snapshots; keep `/api/snapshot` for first load + resync
- [x] [S] 8.3 Client store applies patches by id (immutable updates so only changed workers re-render); gap -> refetch snapshot; tests for apply / gap / reorder / reconnect
- [x] [S] 8.4 Replace pollers (board, runs, tasks, history, server-room processes, chat messages) with `changed` pings + targeted fetch; polling only as fallback while the WS is down
- [x] [H] 8.5 Pause pings/fetches for panels that are not visible (hidden tab or closed chat)
- [x] [S] 8.6 Measure before/after: bytes/s over WS with a 150-worker fixture, client re-render counts
- [x] [H] 8.7 Rename "Agent Office" -> "SparkBots" in docs (CLAUDE.md title, README, TASKS.md heading, package name); open decision: keep `~/.agent-office/` data dir (recommended, with a later migration to `~/.sparkbots/`)

## Phase 9 — 3D campus (zones, richer bots)
Order: 9.1-9.4 (foundations) first, then amenities one at a time; each ends with a browser check.
- [x] [O] 9.1 Architecture: split `World.tsx` (scene, bots, UI overlays); zone/POI model (a zone has points of interest with slots a bot can reserve); deterministic campus layout (center plaza + amenities, team areas around, manager room + data room at the edge); expandable zones (conference room grows with attendees) — **done (partly):** zones, actions, clips and effects are auto-loaded data files; robot behaviour moved to `world/bots.ts`, legends to `legends.tsx`; `World.tsx` 995 -> 645 lines (the Scene itself is still ~440 lines).
- [x] [O] 9.2 Navigation: grid + one flow field per destination (shared by all bots) so 150 bots can cross the campus cheaply; keeps the existing bot-to-bot separation — **done:** grid + one flow field per destination (`world/nav.ts`), used by every robot walking more than 1.5 units
- [ ] [O] 9.3 Bot rig: split the merged bot into instanced parts (body, arms, legs, head/eyes) driven by pure `pose(clip, t)` functions; clip blending; icon sprites (!, ?, Zzz, hearts) as an instanced atlas; budget 150 bots at 60 fps
- [x] [S] 9.4 Behavior system: status + needs -> intent -> POI + clip (replaces `modeOf`); weights per zone; deterministic seeds — **done:** idle robots go on trips to zone POIs (`roam.ts` pickVisit/slots, 30 % chance each time they pick a new wander spot); data-driven zones `world/zones/*.ts`
- [x] [S] 9.5 Idle clip library (10+): stretch, yawn, look around, juggle, dance, check phone, read, tie shoe, tap foot, spin antenna, sip coffee — **done:** 12 idle clips + 7 for zones (`world/clips/*.ts`, auto-loaded)
- [x] [S] 9.6 Status clips: done = happy jump + confetti; error = sad walk in circles around the desk + red "!" shouting above; waiting = hand raised + amber "?"; asleep = Zzz; working per activity (typing, reading hologram, flask, box carry) — **done:** done = happy jump, error = sad circles around the desk with a red !, waiting = hand raised with ?, asleep = Zzz icon
- [x] [S] 9.7 Water cooler: "follow me" button/key (selected bots flock behind the manager), brainstorm circle at the cooler, optional group chat — **done:** followers huddle in a circle around you when you stand still (water cooler or anywhere); Meeting chat for them
- [x] [O] 9.8 Conference room: grows with attendee count; bots who follow you sit in; one message goes to every attendee (N headless sends, live-in-terminal ones fork, confirm the count first; replies shown per robot) — **done:** table + chairs grow with the people inside (4 to 10 seats, `world/conference.tsx`), followers sit down when you enter the room, Meeting chat sends one message to all (confirm shows the count; terminal sessions are forked; max 12)
- [x] [S] 9.9 Coffee station: service robots (NPCs, not sessions) deliver a coffee when a bot starts a turn (cosmetic) — **done:** service robots (teal, not sessions) bring a cup from the coffee station when an agent starts working (`world/servicebots.tsx`)
- [x] [O] 9.10 Archive instead of delete: the app never deletes sessions (read-only rule). "Archive" is an explicit action with a confirmation + notice (red alert style), stored in `~/.agent-office/archive.json` (id, at, reason); archived agents leave the office and live in an Archive list with Restore. Animation: the agent walks to the data room / archive cabinet and files itself away. Board cards get the same treatment (archive, restore) instead of hard delete
- [x] [S] 9.11 Idle zones (idle/asleep agents pick one): kitchen, cafe seats, game room (billiards, table soccer, darts, table tennis), gym (lifting, treadmill, pool), veranda with barbecue, yard with robot dogs, restroom (cosmetic only) — **done:** kitchen, cafe, game room, gym (with pool), veranda, yard, restroom exist as zone files; yard dogs are static props for now
- [x] [S] 9.12 Manager room: kanban wall (board rendered to a texture, click opens the panel), whiteboard (notes/ideas saved in `notes.json`, link a note to a card), stats wall per service — **done:** kanban wall with live counts + whiteboard with sticky notes (`world/walls.tsx`, `server/notes.ts`, Notes panel); clicking opens Board / Notes
- [x] [S] 9.14 Tasks into the Kanban: "Import tasks" per project reads the project task file (existing `server/tasks.ts`) and fills the board (unchecked -> Backlog, checked -> Done, de-duplicated by task text); optionally also each agent's latest TodoWrite list from its transcript. Explicit button, never automatic — **done:** Board "Import tasks" button, `/api/board/import` (per-agent TodoWrite import not done)
- [x] [S] 9.15 Sub-agent minibots: list the sub-agents an agent started (`<session>/subagents/agent-*.jsonl` + `.meta.json`: type, description, model, finished) and show them as minibots in the office corners, the parent agent as the conductor ("dirigent") who points at them; minibots go idle/leave when finished — **done:** minibots in the corners of the parent project area, conductor clip; `/api/subagents`
- [x] [O] 9.13 Data room (small server room): terminal in 3D opens a query panel over projects/sessions/stats; needs a local search index (`node:sqlite` FTS over transcript text, incremental) — first real use of a database, justified by full-text search — **done:** Data room 2D search + clicking the data room floor in 3D opens it

## Phase 10 — Many services (not only Claude Code). Terms: agent = a session/chat; sub-agent = started by an agent
CLAUDE.md says a second adapter waits until after release; this request replaces that rule, update CLAUDE.md when 10.1 starts.
- [x] [O] 10.1 Service model: `Service {id, kind, name, url?, pid?, status}`; what a "agent" means for a model server (an agent = one session/chat; a server without sessions, e.g. Ollama, shows as a service with its loaded models). Sub-agents are NOT agents: they are minibots of their parent (9.15); adapter contract changes — **done:** service model + registry (`server/services/`), tokens never leave the server (file is 0600)
- [x] [O] 10.2 Discovery: local process scan + well-known localhost ports (ollama, LM Studio, llama.cpp, opencode, ...); LAN scan only on explicit opt-in with a user-typed range, never automatic; manual add (name, URL, optional token) — **done:** local port + process scan, manual add, LAN range scan only on explicit request (private /24 max)
- [x] [S] 10.3 Settings: services list with scan / add / remove / test connection (searchable like the other settings) — **done:** Services panel (scan, add, test, remove)
- [x] [S] 10.4 Per-service stats on the manager-room wall and in Stats — **done:** Stats page lists other services (up/down, latency, loaded models)
- [x] [S] 10.5 First extra adapter (OpenCode or Ollama) to prove the contract — **done:** Ollama / LM Studio / llama.cpp / OpenAI-compatible probes list models and loaded models
- [ ] [S] 10.6 MCP connection (later): list servers per project, show in the server room

## Phase 11 — Interactions with agents (beyond Z "zap")
Terms: *fx* = cosmetic only (no session touched); *real* = sends something to a session or changes app data, always behind a confirmation. Everything plugs into the actions list in `src/world/actions.ts`.

**Haiku brief template** (paste into the Agent prompt; Haiku gets nothing else): goal in one sentence, exact files to edit, the contract (types/signatures below), what NOT to touch (server code unless named; `World.tsx` only the named lines), the acceptance check (a Vitest test or a command), and "run `npx tsc --noEmit -p . && npx vitest run`, report only pass/fail and files changed". Opus/Sonnet reviews the diff.

### 11.0 Foundation (do first; Sonnet/Opus)
- [x] [O] 11.0.1 Contract: `BotAction { key, label, hint, kind: "fx"|"real", confirm?: string, needsFree?: boolean, run(ctx: ActionCtx) }`, `ActionCtx { workerId, worker, manager: {x,z}, others: Worker[] }`; registry validation (unique keys, no key clashes with WASD/E/V); `real` actions return a Promise and never run without the confirm step. Write it in `actions.ts` + a short section in docs — **done:** `BotAction` contract + registry validation (`world/actions.ts`)
- [x] [S] 11.0.2 Generic pooled effect system `src/world/fx.tsx` (replaces zap-only code): `playFx(kind, workerId, opts)`; kinds are data (`{ particles, color, shape, rise, spin, duration }`) so a new effect = a new entry, no new component; keep zap as the first kind; max N concurrent — **done:** data-driven effects `world/fx/*.ts` + `fxlayer.tsx`
- [x] [S] 11.0.3 Action bar: small HUD in the 3D view listing the actions for the nearby agent (key + label, clickable, greyed when not applicable); help text generated from the registry; `real` actions open a confirm dialog (action, target agent, what will be sent) — **done:** agent popup menu (Actions list) + clickable keymap instead of a separate bar
- [x] [H] 11.0.4 Settings entry (searchable): "Action keys" list showing the bindings read-only, plus a toggle "Confirm real actions" (default on, cannot be turned off for send-type actions) — **done:** Settings > Keymap (show toggle + list)

### 11.1 Cosmetic actions (Haiku each; needs 11.0.1-11.0.2)
Each = one entry in `ACTIONS` + one `fx` kind + a poseBot tweak only if named + one test in `test/actions.test.ts`.
- [x] [H] 11.1.1 **Pat** (key `p`): hearts rise from the robot, happy wiggle (2 s), bubble-free; wakes a sleeper for 8 s — **done:** Pat
- [x] [H] 11.1.2 **High-five** (key `h`): robot raises the arm bar (rotation z = +0.9 for 1 s), yellow spark burst at the arm; only when the robot is within 2 units — **done:** High-five
- [x] [H] 11.1.3 **Wake** (key `k`): gentle wake: stretch + yawn clip (scale y 1.15 then back), small "!" pop; no lightning — **done:** Wake
- [x] [H] 11.1.4 **Startle** (key `b`): robot jumps 0.5 and spins once, "?" puff; nearby wanderers (< 3 units) turn toward it for 2 s — **done:** Startle
- [x] [H] 11.1.5 **Dance** (key `n`): 4 s side-step + arm seesaw loop, music-note particles — **done:** Dance
- [x] [H] 11.1.6 **Name tag** (key `t`, toggle): floating label above each robot showing `displayName(worker)` (pooled canvas texture like `bubbles.tsx`, max 14 nearest) — **done:** Name tag (key T)
- [x] [H] 11.1.7 **Paint** (key `c`): spray-can spray fx in the robot's own color, flash its body white then back (reuse the zap tint path in `poseBot`) — **done:** Paint

### 11.2 Moving agents around (Sonnet; needs the roam system, later the zones of Phase 9)
- [x] [S] 11.2.1 **Carry / follow me** (key `f` toggles): the nearest agent (or all selected) walks behind the manager at 1.2 units, in a loose line; new `follow` mode in `roam.ts`; keeps bot-to-bot separation; releasing returns it to its normal behavior — **done:** F toggles follow for the closest agent; trail behind, huddle, sit
- [x] [H] 11.2.2 Multi-select: shift+click desks to build a "followers" set in the store (`followers: string[]`), shown with a small ring marker; Esc clears — **done:** shift+click agents, followers bar with Dismiss (X) and Meeting chat (Q)
- [x] [S] 11.2.3 **Send to a spot**: pick a marker in the room (interim: fixed spots near the room edges; later the zones from 9.1) and the agent walks there and idles for 60 s, then returns — **done:** agent menu "Send to…" a room (stays 60 s)
- [x] [H] 11.2.4 **Rally** (key `r`): every `waiting` agent walks to the open floor around the manager and faces them; second press sends them back — **done:** R rallies every waiting agent round you

### 11.3 Real actions (Sonnet; each behind the confirm dialog from 11.0.3)
- [x] [S] 11.3.1 **Nudge** (key `g`): sends a canned short message to the agent ("Are you still there? Please give a one-line status.") via the existing `/api/send`; confirm shows the exact text; disabled for live-in-terminal agents (offer fork instead); at most one nudge per agent per 60 s — **done:** Nudge (key G), rate limited, refused for terminal sessions
- [x] [S] 11.3.2 **Give task**: drag a Kanban card onto a desk (or a robot) in the 3D view = the Board "Send ▾" with the agent pre-selected (message / fork choice in the confirm) — **done:** agent menu "Give a card…" (Backlog/Ready cards of the project, confirm, fork for terminal sessions)
- [x] [S] 11.3.3 **Fork / hire** (key `y`): `/api/send` with `fork:true` and a prompt typed in the confirm; the new agent appears at a new desk and walks out of the original — **done:** Fork into a new agent (key Y)
- [x] [S] 11.3.4 **Pause**: stop an app-started run (`/api/stop`, SIGTERM to our own child only); shown only when `run.status === "running"`; never for terminal sessions — **done:** Pause is a quick action in the agent menu
- [x] [S] 11.3.5 **Wake all / lunch** (bulk, fx only): every asleep agent is woken 15 s (`awakeUntil`); "lunch" sends all idle agents to their idle spots; one toggle in the action bar — **done:** U wakes everyone asleep (15 s), I sends idle agents to lunch
- [x] [H] 11.3.6 Tests for the real actions' guards: nudge refuses live-in-terminal, rate limit works, pause refuses a run the app did not start, confirm text contains the exact prompt (extend `test/command.test.ts` style) — **done:** `test/guards.test.ts`

### 11.4 Needs other phases
- [x] [S] 11.4.1 **Promote to conductor** (after 9.15): choose an agent as the "dirigent"; its sub-agent minibots stand around it, it points a baton at the one that is working — **done:** the conductor is automatic: an agent with working sub-agents waves a baton; no manual promotion
- [x] [S] 11.4.2 **Conference** (after 9.8): the followers set enters the room; one message to all (counts shown before sending) — **done:** done with the meeting chat
- [x] [O] 11.4.3 Review: security pass over all `real` actions (confirmation cannot be skipped by a key repeat, no action sends text taken from transcripts, rate limits, audit line in the run registry: who/what/when) — **review notes:** every real action (Nudge, Fork, Continue, Give card, Meeting chat, Archive) goes through `window.confirm` showing the exact text; key auto-repeat is ignored so a held key cannot re-fire; prompts are typed by the user or fixed strings, never taken from transcripts; terminal-open sessions are forked, never written to; Nudge is rate limited per agent (client side) and the server still refuses sends to terminal sessions; archive needs `confirm: true` server side; services probes block metadata addresses, do not follow redirects and never return tokens.

### Suggested order
11.0.1 -> 11.0.2 -> 11.0.3 (Opus/Sonnet, one session) -> then in parallel Haiku: 11.1.1, 11.1.2, 11.1.3, 11.1.4, 11.1.5, 11.1.6, 11.1.7, 11.2.2, 11.2.4, 11.0.4 -> Sonnet: 11.2.1, 11.3.1, 11.3.5 -> 11.3.2-11.3.4 -> 11.3.6 (Haiku) -> 11.4.3 review.
Count: 1 Opus + 1 review, 11 Sonnet, 12 Haiku.

## Status after the big build session (what is left)
Done: Phase 8; 9.2, 9.4-9.6, 9.11, 9.14 (file import), 9.15; archive of agents (9.10: agents; board cards still hard-delete); Data room 2D search (9.13, the 3D terminal link is still open); real-data checks: search index 573 sessions / 39,617 messages, sub-agent listing.
Also done since: follow-me, multi-select, huddle, conference room with one message to everyone (9.7, 9.8, 11.2.1, 11.2.2).
Latest: everything lives in the central plaza (manager/data rooms on top, amenities in the middle, fun and outdoor areas below); Shift sprints with acceleration; the 3D office stays mounted when you visit other panels (camera, position and zoom are kept); real actions ignore key auto-repeat.
Open: 9.3 (head part of the bot rig), 10.6 (MCP), and the leftovers below (World.tsx still ~640 lines; new work lives in auto-loaded files), 9.3 (head/antenna parts), 9.9 coffee service robots, 9.12 kanban wall texture + whiteboard, 11.2.3 send-to-spot, 11.2.4 rally, 11.3.2 drag a card onto an agent, 11.3.5 wake all, 11.3.6 guard tests, 11.4.x, Phase 10 (services), 7.27 (Claude run settings).

- [x] [S] 7.32 Rooms: glass walls and the yard fence are see-through force fields you can walk through (`ghost` props); rooms have no floor color (only the yard and veranda have ground); titles are floating, clickable labels above projects and rooms that stack instead of overlapping (nearest at the bottom); fix: idle, wandering and sleeping agents can be clicked again (cached click bounding sphere)
- [x] [S] 7.33 Clicking a floating title opens an actions menu: for a project Go there, Continue all (confirm, skips working/terminal agents, max 12), Pause all (only runs started from SparkBots), Rally the waiting, Meeting with this project, Wake the sleepers, Lunch, Status; for a room Go there, Send idle agents here, Who is here
- [x] [S] 7.34 Nerd stats section in Stats: 3D view (fps, frame time, draw calls, triangles, GPU objects, robots, JS heap), live connection (messages and bytes per second, full snapshots vs patches, resyncs), server (memory, event-loop lag, sockets, snapshot size, runs), data (sessions by state, search index size, history); `/api/nerd`
- [x] [O] 7.35 One dock with tabs next to an always-visible 3D office (`src/dock/`, `state/dock.ts`): the menu is an icon rail; panels and one chat per agent are tabs (side dock: resizable, left/right, hide; ⤢ opens any panel in the big window); the Board always opens in the big window and shows one column at a time with a selector when narrow; Settings sections become a dropdown when narrow; under 900 px the dock is a bottom sheet (90 % height) with the rail as a bottom bar (not verified: the test pane cannot emulate a phone width); links both ways: Teams / Control Room / search results fly the 3D camera to the agent and open its chat tab, Teams has a 📍 button per project, the 3D project menu's "Open in Teams" expands and scrolls to the project
- [x] [S] 7.36 Coffee: a barista robot behind the coffee station counter makes one cup at a time (works while orders are queued), O orders a coffee for the manager, "Bring a coffee" in the agent menu; Map tab (dock + rail): bigger minimap with room icons (☕ 🏋 🎱 ...), rooms and projects as fly-to chips, click the map to fly/move there; room icons also in the floating titles
- [x] [S] 7.37 Panels menu moved to the top right (on screens 1100 px and wider every panel is an icon button in the header; below that a Panels dropdown, which is the main menu on small screens), the left icon rail is gone, dock tabs and the dialog use the same SVG icons (`dock/icons.tsx`, `dock/PanelMenu.tsx`); no floating minimap over the 3D view any more (the Map tab replaces it, key M opens it)
- [x] [S] 7.38 Header icons are toggles that show one panel in the dock (no panel tabs; only chats are tabs, one per agent) and there is a Chats icon (open chats + start a chat with any agent, badge with the number of open chats); the 3D camera controls moved from the header into a View panel with the view mode (Overview / Walk) on top; a Projects panel replaces the Projects dropdown (state counts, fly-to, group actions shared with the 3D title menu: `world/ProjectActions.tsx`); Services and Server Room use stacked cards; smaller, redrawn SVG icons, shown in the header from 760 px up
- [x] [S] 7.39 The coffee station is a small coffee factory (`zones/coffee-station.ts` + animated `world/coffeefactory.tsx`): bean silo and grinder with a spinning gear, brass boiler with steam, chimney smoke and blinking status lights, a counter with the espresso machine, a conveyor belt carrying cups, a cup dispenser and crates; the barista is clickable (and so is "Order a coffee" in the room's title menu): a toast answers and a service robot brings the cup
- [x] [S] 7.40 Chat composer: Send always next to the text box (greyed when it cannot send; for a terminal-held session pressing it explains why), "Send as fork" below it with an ⓘ that says a terminal holds the session (+ copy resume command), no permanent warning; file / image attach (button, drop, paste): saved in ~/.agent-office/uploads, listed in the message, folder given to the run with --add-dir (`server/uploads.ts`, 15 MB per file, 8 per message, cleaned after 14 days); model errors in a run explain where the run is going and offer "Use real Claude" (clean environment) or a model the service has
- [ ] [S] 7.41 To replace the Claude app: live streaming of replies, approving permission prompts in the chat, slash commands / skills, a model picker per chat with the session's current model shown, image preview of attachments
- [x] [S] 7.42 Robots go around the manager and each other (steering) and wait a step away when someone stands on their chair, instead of getting stuck; click a laptop screen = the camera flies right in front of it (Back button or Esc returns) — both unverified on screen
- [ ] [S] 7.43 Redesign the Board (kanban) dialog: nicer columns, cards, spacing, drag targets, header/filters
- [ ] [S] 7.44 Data room revamp: server racks with blinking red LEDs, tape units with spinning reels and streaming tape, a hydra-like AI core with waving cables and pulses, a force-field wall around it (ghost props), small inspector robots walking between racks (see the plan in the chat: zones/data-room.ts + world/datacenter.tsx)

## Phase 12 — Codex sessions as agents (second adapter)
Checked on this machine (read-only, structure only): `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl` (38 live files; older ones are `archived_sessions/*.jsonl.zst`), `~/.codex/config.toml` lists trusted projects. Records: `session_meta` (id, cwd, cli_version, originator), `turn_context` (cwd, approval policy, sandbox), `event_msg` task_started / task_complete (duration), item_completed, token_count, `token_usage_record` (usage per response), `response_item` message / function_call / custom_tool_call / reasoning. Never read `auth.json`.
- [ ] [O] 12.1 Multi-adapter core: `Company` is wired to Claude Code today (discover, tailer, parseLine, liveness). Give `SessionRef`/`Worker` a `source: "claude-code" | "codex"`, make the adapter list pluggable (`server/adapters/<id>/` implementing `AgentAdapter`), keep ids unique per source, same project grouping (Claude + Codex sessions of one cwd share a team)
- [ ] [S] 12.2 Codex discovery, title and cwd from `session_meta`, incremental tail, mapping to `AgentEvent`s (task_started/task_complete = turn start/end, function_call/custom_tool_call = tool with the same activity labels, token_usage_record = usage) with hand-written fixtures under `test/fixtures/codex/`
- [ ] [S] 12.3 Codex liveness: no sessions dir like Claude's; use `ps` (a `codex` process whose cwd matches) + file mtime < 15 s; mark interactive vs `exec`
- [ ] [H] 12.4 UI: a small source badge on agents (Teams list, chat header, desk screen), a per-source chip in the header filters, Codex agents get a different eye/ring accent
- [ ] [S] 12.5 Stats + search: Codex tokens in Stats (separate model rows), Codex transcripts in the Data room index (`source` column)
- [ ] [S] 12.6 Talking to a Codex agent: `codex exec resume <id> "<prompt>"` in the project dir (argument array, never a shell; never the sandbox/approval bypass flag), same rules as Claude (terminal-open sessions forked or refused, one run per session, Stop only kills our own child). Check the exact flags with `codex exec --help` first
- [ ] [H] 12.7 Archived `.zst` sessions: skipped at first; later an on-demand "load archived" with a streaming zstd reader (needs a decision on a dependency)

## Notes
- Haiku returned `model_not_found` in this environment (default model alias there is `beam-free`); delegated tasks ran on Sonnet. Re-tag Haiku when available. Office runs inherit the user's default model, so they fail the same way if that alias is broken.
- Hook event names/payload fields verified against Claude Code 2.1.328 settings + docs on this machine only (`[VERIFY]` on upgrade).
- Not verified: a full successful real run end-to-end (the only real call errored on the model alias); wave/animation visuals beyond a static screenshot.
