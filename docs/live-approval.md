# Live tool approval (task 7.41 c)

Status: implemented, **opt-in** (Settings > Claude runs > "Live tool approval (experimental)", default off). The default path
(one `claude -p` per message + "Allow this tool & retry") is unchanged and remains the supported fallback.

## What was tried (claude 2.1.328, throwaway dir, real model)

| Flags | Result |
|---|---|
| `-p --input-format stream-json` + `--permission-prompts host` (the default) | A tool that needs permission is **denied immediately** (`"... you haven't granted it yet"`); no `control_request` is ever emitted, even after an `initialize` control request. |
| `--permission-prompt-tool stdio` | **Works.** The CLI writes `{"type":"control_request","request_id":…,"request":{"subtype":"can_use_tool","tool_name","input","tool_use_id","permission_suggestions"…}}` on stdout and waits. |
| Answer `{"type":"control_response","response":{"subtype":"success","request_id":…,"response":{"behavior":"allow","updatedInput":<the input>}}}` | Tool runs. `updatedInput` is required for allow. |
| Answer `{"behavior":"deny","message":"…"}` | Tool result is an error with that message; Claude explains and continues. |
| A second `{"type":"user","message":{…}}` line after a `result` line | Same process, same `session_id`, next turn. |
| `--resume <id>` together with the stdin stream | Continues the existing session (same id). |
| `initialize` control request | Optional. Its response lists the available slash commands/skills (not used yet). |

Not every prompt asks: the user's own settings (allow rules, auto mode, `defaultMode`) still decide first. Only what would
prompt becomes a `can_use_tool` question. A project can force asking with a team `permissionMode: "default"` override.

## Design

- `live.ts` `LiveProcess`: one process per chat, argv from `buildLiveArgs` (same validation as one-shot runs; `bypassPermissions`
  refused; no `--dangerously-*` flag anywhere), no shell. Parses stdout lines; answers unknown control requests with an error
  response so the CLI never waits for us.
- `RunManager.startLive`: each message is still a **run** (registry, log, board cards, Stop work as before). A run ends at the
  `result` line; the process stays for the next message and is closed after 10 idle minutes (stdin end; resume starts a new one).
  Options that change per message (model, attachment folders, allowed tools, mode) restart the process with `--resume`.
- Queue semantics preserved: one turn at a time per session, later messages are queued and sent when the turn ends.
- Approvals: synthetic log lines `approval_request` / `approval_resolved`; `POST /api/runs/:id/approve {requestId, allow}`.
  **Allow once** only (nothing is persisted, `permission_suggestions` are ignored). Unanswered for 30 min = denied.
  `AskUserQuestion` is auto-denied with a message (the chat has no UI for it).
- Stop = SIGTERM to our child (as before); pending questions are marked cancelled.
- Liveness: a stream-json process registers in `~/.claude/sessions/` as `kind: "interactive"`, which would make the chat look
  "live in a terminal". `Company.ownPids` (from `RunManager.livePids`) reclassifies our own pids as headless.
- If the server dies the process's stdin closes and it exits; the registry shows the run as orphaned/error as before.

## Not done / limits

- No "always allow" (would need `updatedPermissions`; deliberately left out).
- Only chats that already have a session id use live mode; new workers (`spawnNew`) and forks stay one-shot.
- A chat whose session is open in a terminal is still refused (rule 5.2).
