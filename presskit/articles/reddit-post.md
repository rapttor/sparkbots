# Reddit post draft

Suggested places: r/ClaudeAI, r/ChatGPTCoding, r/opensource, r/selfhosted, r/threejs. Read each subreddit's self-promotion rules first and adapt the first line.

## Title

I built a local 3D office where each AI coding agent session is a little robot at a desk (open source)

## Body

I run several coding agent sessions at once (Claude Code, Codex, OpenCode) and I could never tell which one was waiting for me. So I made SparkBots: a browser-based 3D office where every session is a robot, and every project is a team area.

What it shows:
- Who is working, who is waiting for you (amber beacon), who is asleep
- Token usage per service over 7/30/90 days, kept in a local SQLite file (costs are estimates)
- A kanban board that can send a card to an agent, fork one, or start a new robot

What you can do:
- Send a prompt to a session from the 3D room or a chat panel
- Wander around a campus with a data center (one rack per project), a coffee factory, a game room, gym, restaurant and conference room
- Or ignore the 3D completely: every room is also a normal 2D panel

The cosmetic stuff: idle robots play pong and air hockey with rankings, there is a simulated "water cooler" chat (clearly fake), and Perform actions like zap and dance.

Privacy: binds to 127.0.0.1, token on every request, Host/Origin checks, no telemetry, read-only on the agents' folders, never uses --dangerously-skip-permissions, and it will not write to a session that is open in a terminal.

Honest limits: those tools' file formats are not a public API so things can break after updates, it cannot show subscription quota, and for now you run it from source (pnpm install, pnpm build, pnpm start). `&fixture=100` in the URL gives you fake workers to play with.

Repo: https://github.com/rapttor/sparkbots (MIT). Happy to hear what is confusing or broken.
