# X thread draft (9 posts)

1/ I kept losing track of which of my AI coding agent terminals was waiting for me. So I built SparkBots: a little 3D office where every agent session is a robot at a desk. Open source, runs locally.

2/ Every Claude Code, Codex or OpenCode session is a robot. Every project is a team area. Working, waiting for you, asleep: each looks different, so you see the state at a glance.

3/ When an agent needs you, an amber beacon pulses over its desk. When a turn finishes, it waves. When nothing is running, it sleeps with a little Zzz.

4/ You can talk to an agent from the 3D room or a chat panel. If a session is open in a terminal, SparkBots will not write to it. It offers to fork it instead.

5/ There is a kanban board too. Send a card to an agent, fork an agent with it, or start a new robot. Cards never move to Done by themselves.

6/ The campus has a data center (one rack per project), a coffee factory with a barista robot, a game room with pong, air hockey, rock-paper-scissors and dice, a gym, a restaurant and a conference room. All cosmetic, all optional. Every room is also a 2D panel.

7/ Stats per service over 7/30/90 days, kept in a local SQLite file, so history outlives deleted transcripts. Costs are estimates and labelled that way.

8/ Privacy: binds to 127.0.0.1, token on every request, no telemetry, read-only on your agents' folders, never --dangerously-skip-permissions. Nothing leaves your machine.

9/ Honest bits: those tools' file formats are not a public API, so updates can break things. You run it from source for now. Try fake workers with &fixture=100 in the URL. https://github.com/rapttor/sparkbots

(Attach: artwork/bots-trio.svg exported as PNG on post 2, a GIF of the amber beacon on post 3. See screenshots/SHOTLIST.md.)
