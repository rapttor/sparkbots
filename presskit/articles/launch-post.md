# SparkBots: a small 3D office for your AI coding agents

If you use AI coding agents a lot, you probably know the feeling of having six terminals open and no idea which one has been waiting for you for twenty minutes. I wanted something calmer than a tab bar, and a bit more fun. So SparkBots turns your agent sessions into a little office.

SparkBots is a local, browser-based 3D "office". Every Claude Code, Codex or OpenCode session shows up as a small robot at a desk. Every project is a team area. You can see at a glance who is working, who is waiting for you, and who is asleep. When a robot needs you, an amber beacon pulses above its desk. When a turn finishes, it waves.

It is open source (MIT) and runs on your own machine.

## What you can do with it

**Look.** The 3D campus has a plaza in the middle and rooms around it. There is a data center with one rack per project and blinking lights, a coffee factory with a barista robot, a game room, a gym, a restaurant, a conference room and a manager room with a kanban wall. Robots that have nothing to do wander off to these rooms. None of this is required: every room is also a plain 2D panel, so walking is optional.

**Count.** The stats view shows token usage per service (Claude, Codex, OpenCode) over 7, 30 or 90 days. History is stored in a small local SQLite file, so it survives even when a tool deletes its old transcripts. Cost figures are estimates from a price table in the repository, and they are labelled that way.

**Talk.** Walk up to a robot, or open its chat panel, and send a prompt to that session. SparkBots uses each tool's documented non-interactive mode and passes your text as an argument, never through a shell. If a session is open in an interactive terminal, SparkBots will not write to it; it offers to fork it into a new worker instead.

**Plan.** The kanban board can send a card to an agent, fork an agent with it, or start a new robot for it. A read-only lane shows tasks from a project's Backlog.md. Cards never move to Done on their own.

**Play.** Idle agents pair up in the game room for pong, air hockey, rock-paper-scissors and dice, and per-agent rankings are kept. It is cosmetic, and I will not pretend it is anything else. There is also a simulated "water cooler" chat between idle agents, which is clearly fake, and a set of Perform actions (zap, dance, high-five and so on) that only animate robots and never touch a session.

## Privacy and safety first

A tool that can start agents deserves suspicion, so the rules are strict. The server binds to 127.0.0.1 only. Every request needs a random token, and requests with a foreign Host or Origin header are rejected. There is no telemetry and no external requests. SparkBots only reads `~/.claude`, `~/.codex` and the OpenCode database; its own files live in `~/.agent-office/`. It never uses `--dangerously-skip-permissions` or `bypassPermissions`. "Stop" only signals processes SparkBots started itself.

## Try it

You need Node 24 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm start     # prints http://127.0.0.1:4317/?t=<token>
```

No agents yet, or you do not want to show real projects? Add `&fixture=100` to the URL and the office fills with fake workers.

## What it is not

Claude Code, Codex and OpenCode store their data in formats that are not public APIs. SparkBots parses them defensively and skips what it does not understand, but a tool update can still break something. SparkBots cannot show your subscription limits, because that information is not in local files. Some backlog items are still open. It is a personal tool first, shared in case it is useful to someone else.

## Where to find it

The code, the issues and the roadmap are at https://github.com/rapttor/sparkbots. If you want to support it: https://www.patreon.com/c/rapttor or https://buymeacoffee.com/rapttor. If you try it, I would like to hear what broke and what felt silly in a good way.

*SparkBots is independent and is not affiliated with Anthropic, OpenAI or the OpenCode project.*
