# Sync protocol (server -> browser)

Replaces "push the whole snapshot on every change" and the per-panel polling loops.

## Messages (WebSocket `/ws`)
| type | payload | when |
|---|---|---|
| `hello` | `{rev, snapshot}` | on every (re)connect: full state at the current rev (= resync) |
| `patch` | `{rev, at, ops}` | agents/projects changed; `rev` must be previous + 1, otherwise the client reconnects |
| `changed` | `{kind, id?}` | a slice the browser fetches itself changed: `board runs tasks history processes stats messages` |

`ops`: `w` (add/replace agent), `wd` (agent gone), `t` (add/replace project meta), `td` (project gone), `m` (skipped lines, label definitions).

## Server (`server/sync.ts`, `src/shared/sync.ts`)
- `Differ` keeps a JSON string per agent / project and emits ops only for entries that differ; nothing changed = nothing sent.
- `Hub.changed()` coalesces pings for 120 ms. Sources: board routes + board sync, `RunManager.onChange` and run stream lines, transcript changes (`messages`, per session id), history `version`, live process list signature, task lists + stats signature (every 10 s).

## Browser
- `ClientState` (shared) applies patches; unchanged projects keep their object identity so React skips them.
- `useLive(load, kinds, id?, enabled?)` (`src/state/live.ts`): load once, reload on a matching ping, pause while the tab is hidden, refetch when it returns, slow fallback poll (5 s) only while the WebSocket is down.

## Measured (real data, 154 agents)
hello 354 KB; a steady-state change is a patch of a few agents (a few KB) instead of 354 KB. Opening the Board costs one fetch; a card added elsewhere costs one refetch, and nothing repeats afterwards (previously every 3 s).
