# Show HN draft

## Title

Show HN: SparkBots, a local 3D office where your AI coding agent sessions are robots

(Alternative, plainer: "Show HN: SparkBots, see your Claude Code / Codex / OpenCode sessions as a small office")

## URL

https://github.com/rapttor/sparkbots

## First comment

Hi, I made SparkBots because I kept losing track of which of my agent terminals was waiting for me.

It reads the local session history of Claude Code, Codex and OpenCode and shows each session as a small robot at a desk, with one team area per project. Working, waiting for you and asleep each look different, so you can tell at a glance. You can also send a prompt to a session from a chat panel or by walking up to the robot, and there is a kanban board that can hand a card to an agent.

How it works, briefly: a Node/Fastify server tails the session files incrementally, builds state per session, and pushes small patches to a React Three Fiber client over a WebSocket. Prompts go through each tool's documented headless mode with an argument array, so there is no shell. Usage history is kept in a local SQLite file.

Things you should know before trying it:

- It binds to 127.0.0.1 only, needs a token, has no telemetry, and only reads your agents' directories. It never uses --dangerously-skip-permissions.
- It will not write to a session that is open in an interactive terminal; it offers to fork instead.
- The on-disk formats of these tools are not a public API, so a tool update can break parsing. Unknown lines are skipped and counted.
- Cost numbers are estimates from a price table in the repo. It cannot show subscription limits.
- It started as a personal tool. Rooms, mini-games and the "water cooler" chat are cosmetic and a bit silly; every room also has a plain 2D panel.
- Run from source for now: pnpm install, pnpm build, pnpm start. Add &fixture=100 to the URL for fake workers.

Feedback welcome, especially on setups where session detection gets it wrong.
