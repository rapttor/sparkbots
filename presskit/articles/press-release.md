# SparkBots: open-source 3D office shows what your AI coding agents are doing

**FOR IMMEDIATE RELEASE** — [date: add here]

[city/country: add here] — SparkBots, an open-source project, turns the session history of AI coding agents into a small 3D office in the browser. Each Claude Code, Codex or OpenCode session appears as a robot at a desk, and each project becomes a team area, so a developer can see which agents are working, which are waiting for input and which are idle.

The tool runs entirely on the user's computer. It binds to the local address only, requires a token on every request, includes no telemetry and reads agent data without modifying it. It never starts agents with permission checks disabled.

**What it does**

- Shows agent state (working, waiting, asleep, done) in a 3D campus with rooms such as a data center with one rack per project, a coffee factory, a game room, a gym, a restaurant, a conference room and a manager room. Every room is also available as a plain 2D panel.
- Lets users send a prompt to a session from a chat panel or from the 3D room, with safeguards: sessions open in an interactive terminal are never written to, one run per session at a time.
- Includes a kanban board that can hand a card to an agent, fork an agent or start a new one, and a read-only lane for Backlog.md tasks.
- Reports token usage per service over time, with history stored in a local SQLite file. Costs are labelled as estimates.

**Honest limitations**

The on-disk formats of the supported tools are not public APIs, so updates may require parser fixes. SparkBots cannot show subscription quota. It is currently run from source.

**Availability**

SparkBots is released under the MIT licence at https://github.com/rapttor/sparkbots. Press artwork (logo and the three robots) is available in the press kit. Support: https://www.patreon.com/c/rapttor and https://buymeacoffee.com/rapttor.

**About SparkBots**

SparkBots is an independent, open-source, local-first tool that visualises and safely controls AI coding agent sessions as a small robot office. It started as a personal project. The robots are original designs. SparkBots is not affiliated with or endorsed by Anthropic, OpenAI or the OpenCode project; product names are used only to describe compatibility.

**Media contact**

[contact: add here]
