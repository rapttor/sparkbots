# How SparkBots works

A technical overview. SparkBots is a Node 24 / TypeScript server plus a Vite, React 18 and React Three Fiber client. Everything runs locally. Details are in `CLAUDE.md`, `docs/TASKS.md` and the source under `server/` and `src/`.

## 1. One interface per agent tool

Everything specific to a tool sits behind an `AgentAdapter` contract (`server/adapters/types.ts`):

- `discover()` lists known sessions,
- `watch()` emits events (tool use, turn start/end, message, usage, permission wait, sub-agent start/end, error),
- `liveness()` says which sessions have a live process,
- optional `send()` and `spawn()` for commands.

There are adapters for Claude Code, Codex and OpenCode. The OpenCode adapter treats OpenCode's SQLite chat database as read-only and mirrors new rows into a JSONL cache under `~/.agent-office/cache/opencode/`, so the rest of the pipeline sees the same shape of data. Other AI servers (Ollama, LM Studio, llama.cpp and similar) are not session workers; they are tracked as services with status and loaded models.

## 2. Defensive, incremental parsing

The on-disk formats of these tools are not a public API, so every parser follows three rules: ignore unknown fields, skip unparseable lines and count them, never crash the server.

Each session file is tailed incrementally. The server keeps a byte offset per file and parses only appended data, rather than re-reading whole files. On first start it reads only the last part of each file to set the initial state; full-history parsing for statistics runs lazily in the background and is cached by file, size and modification time. The project directory comes from the `cwd` recorded inside the transcript rather than from the folder name, because the folder-name encoding loses information.

Tool names map to activities (reading, coding, testing, running, delegating, planning), which drive the robot's animation.

## 3. Worker state

State is derived, in priority order, from hook events (if you installed the optional hooks), from runs SparkBots spawned itself, from the tool's own live-session information with process validation, and finally from a "file changed recently" heuristic. The result is one of asleep, idle, working, waiting, error or done. Thresholds are configuration, not code. The app works fully without hooks; without them the state can lag by roughly 15 seconds.

## 4. Headless resume for talking to agents

Sending a message uses each tool's documented non-interactive mode, for example `claude -p --resume <id> --output-format stream-json`, with the session's project directory as the working directory. Codex and OpenCode have equivalents. The process is started with `child_process.spawn` and an argument array, so a prompt containing shell syntax reaches the agent as literal text. The output stream is parsed live into the chat panel and animations.

Safety rules are part of the design, not an afterthought:

- a session that is open in an interactive terminal is never written to; the UI offers a fork instead,
- one run per session at a time, extra messages are queued,
- team-level tool and permission overrides can only restrict; `bypassPermissions` is rejected,
- Stop signals only processes SparkBots started, and a run registry survives a server restart so orphaned runs are shown instead of lost.

## 5. Sync: one revision counter

Early versions pushed full snapshots. The current protocol uses a single monotonic revision number on the server. A change log (a ring buffer of recent entries with per-entity hashes) means an unchanged worker produces no patch. Over the WebSocket the client receives `hello` with the current revision, `patch` messages with operations for small entities such as workers, and `changed` pings for larger or rarer data (board, runs, history, processes). A ping makes the client fetch only that slice. If the client detects a gap it refetches a snapshot. The client store applies patches immutably by id, so only changed workers re-render, and hidden panels pause their fetching.

## 6. Storage

Small JSON files in `~/.agent-office/` hold configuration, team merges, the board and the run registry. Data that SparkBots generates and wants to keep, such as hourly usage history, rack aliases and game results, lives in a single SQLite file with numbered migrations. That is why history outlives transcripts that a tool deletes.

## 7. The 3D scene

The campus layout is generated deterministically from data, so desks do not jump around between reloads. Desks and bots are instanced meshes; a bot is split into parts (body, arms, legs, head) posed by pure functions of a clip and a time value, with clip blending. Navigation uses a grid and one flow field per destination, shared by all robots, so many robots can cross the campus cheaply. Asleep robots do no per-frame work, and rendering pauses when the tab is hidden. The project's stated budget is 60 fps on a recent laptop with 100 visible workers; a fixture mode (`&fixture=100`) generates fake workers to test that.

## 8. Security envelope

The server binds to 127.0.0.1, requires a random token on every HTTP and WebSocket request, and rejects foreign `Host` and `Origin` headers to block DNS rebinding and cross-site requests. See `privacy-and-safety.md`.

## What is not covered

Subscription limits or remaining quota are not in local files, so SparkBots does not show them. Cost is an estimate from a price table with a "last checked" date.
