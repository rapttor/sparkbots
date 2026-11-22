# Privacy and safety

SparkBots is a local tool. Its central promise is simple: nothing leaves your machine.

## Privacy

- The server binds to `127.0.0.1` only. There is no option to listen on other interfaces.
- A random token is generated at start and is required on every HTTP and WebSocket request.
- Requests with a foreign `Host` header (DNS rebinding) or a foreign `Origin` header (requests from other websites) are rejected.
- No telemetry. No analytics. No external requests.
- Transcript content is shown only in your browser. Speech bubbles in the 3D room are truncated, and `streamingMode` in `config.json` hides message previews entirely, which is handy when you share your screen.
- To show the app without exposing real projects, use `&fixture=100` in the URL: fake workers only.

## What it reads

Read-only: `~/.claude/`, `~/.codex/` and the local OpenCode SQLite database. SparkBots never edits, moves or deletes anything there. "Archive" in the app is a note in SparkBots' own files, not a deletion.

## What it writes

Only to `~/.agent-office/` (configuration, board, run registry, caches and a SQLite file with usage history), plus one optional step: installing hooks.

Hooks are optional and make state more precise. `hooks install` shows a diff, asks for confirmation and backs up your `~/.claude/settings.json` first. `hooks uninstall` removes exactly the entries it added. The hook entries post to `127.0.0.1` with a separate token stored with mode 0600.

## Safety when talking to agents

- Prompts are passed as argument-array entries. No shell is involved, so shell syntax in a prompt is just text.
- `--dangerously-skip-permissions` and `bypassPermissions` are never used. Nothing SparkBots starts bypasses your permissions.
- A session open in an interactive terminal is never written to. You can fork it into a new worker instead.
- One run per session at a time; extra messages are queued.
- Stop signals only processes SparkBots started itself.
- Actions that send something to a session sit behind a confirmation. Perform actions such as zap, dance and high-five are cosmetic and touch no session.
- Project-level tool permissions apply to runs. Per-team overrides can only be more restrictive.

## Known limits

- The tools' file formats are not a public API; a tool update may confuse SparkBots. It skips what it cannot parse and counts it.
- "Nothing leaves your machine" describes SparkBots. The agents you talk to are still the agents they are: a prompt you send to Claude Code, Codex or OpenCode goes where that tool sends prompts.
- Anyone who can read your user account's files can read the token SparkBots writes for development mode (`~/.agent-office/dev-token`, mode 0600) and your transcripts anyway.
- This is a personal-tool-grade project. It has not had an independent security audit.

Found a problem? Please open an issue at https://github.com/rapttor/sparkbots, or use [contact: add here] for anything sensitive.
