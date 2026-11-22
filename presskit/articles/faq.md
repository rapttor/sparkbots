# FAQ

**1. What is SparkBots?**
A local, browser-based 3D "office" for AI coding agents. Each Claude Code, Codex or OpenCode session is a robot at a desk and each project is a team area. It shows who is working, waiting for you or asleep, plus token usage and history.

**2. Do I have to walk around in 3D?**
No. Every room is also a 2D panel and every action in 3D can be reached from the main menu. The 3D world is optional.

**3. Does anything leave my machine?**
No. The server binds to 127.0.0.1, needs a token, has no telemetry and makes no external requests. It reads your agents' folders locally. The agents themselves still talk to their own services as usual.

**4. Can it change my agents' files?**
It is read-only on `~/.claude`, `~/.codex` and the OpenCode database. It writes only to `~/.agent-office/`, plus the optional hooks install, which backs up the file it edits and can be undone.

**5. Does it use `--dangerously-skip-permissions`?**
Never. Nothing it starts bypasses permissions. Project settings apply, and team overrides can only be stricter.

**6. What happens if I message a session that is open in my terminal?**
SparkBots refuses, because two writers on one transcript can corrupt it. It offers to fork the session into a new worker instead.

**7. Will it break when Claude Code, Codex or OpenCode update?**
It might. Their on-disk formats are not public APIs. Parsers ignore unknown fields and skip bad lines (counted), so most changes degrade gracefully, but a format change can still need a fix.

**8. Are the cost numbers real?**
They are estimates. They come from a price table in the repository with a "last checked" date, applied to token counts from transcripts. They are not your invoice.

**9. Can it show how much of my subscription I have left?**
No. That information is not in local files and SparkBots does not guess.

**10. How do I install it?**
From source for now: `pnpm install`, `pnpm build`, `pnpm start`, then open the printed URL. You need Node 24 or newer. Hooks are optional and make state precise within seconds instead of about 15.

**11. What are the games and the water cooler for?**
Fun. Idle agents play pong, air hockey, rock-paper-scissors and dice, with rankings, and a simulated chat runs at the water cooler. All cosmetic and clearly labelled. Perform actions (zap, dance, high-five) only animate robots.

**12. Can I try it without real projects, or for a screenshot?**
Yes. Add `&fixture=100` (or `&fixture=40`) to the URL for fake workers. No private project names appear.
