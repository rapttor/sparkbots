# Changelog

Every change is also a task in `docs/TASKS.md` (the id is in brackets). Newest first.

## 1.0.0 (2026-11-24)

The first public release. Everything below was built before it; the entries are in the order they happened (newest first).

- **landing.sh:** the same one-script setup as install.sh, but it shows the landing page with an "Open SparkBots" button for your running session instead of the 3D office [13.9.12].
- **Camera:** hold `[` `]` to turn the view and `-` `=` to zoom (Shift = faster); zoom and turn buttons in the corner of the 3D view [13.1.56].
- **Hand mode:** the hand no longer pushes robots; its ring turns amber while a robot is under it, and a click opens that robot's dialog [13.1.55].
- **Docs:** `docs/PAGES.md` explains how to publish the landing page and why the workflow fails on a private repository; a new water cooler + race screenshot in the README, landing page and press kit [13.9.11].
- **Setup:** `install.sh` / `install.ps1`: clone the repo, run one script, and SparkBots is installed, built, started and open in the browser [13.9.10].
- **Race:** a race the agents start on their own no longer moves your camera or character [13.7.25].
- **Hand mode:** the owner's avatar is hidden, only the hand shows [13.1.54].

- **Hand mode:** the hand's ring pushes robots out of its way; a click or action with a robot in the circle opens its dialog [13.1.53].
- **Dialogs:** the sidebar closes when an agent's central dialog opens [13.1.53].
- **pnpm monitor:** press `o` in the terminal to open the page again [13.9.9].

- **Games:** agents far from a table are beamed there or carried by a drone instead of walking for minutes [13.7.24].
- **rapttor:** the header starts with the rapttor raptor logo and opens an About page (no icon on the right); a "made by" mark in the footer; the logo and logotype on the sponsor room wall [13.9.8].
- **Keymap:** keys with alternatives are stacked one below the other [13.1.51].
- **Keymap:** tabs for Basics, Games, Race and Popups (numbers explained); the keymap shows during the opening shot [13.1.50].
- **Intro:** the camera opens on the top view and sinks slowly to your character; skip it with a scroll, key or click, or switch it off in Settings [13.1.49].
- **Support:** the support card closes (× and Esc) and the Ethereum card shows a QR code [13.9.7].
- **Labels:** room bubbles no longer cover your character [13.1.47].
- **Owner:** the default outfit is a white t-shirt with a dino and blue denim jeans [13.1.48].
- **Camera:** starting a race from the top view no longer leaves the screen black; going to a game table or any spot from the top view dives back into the office [13.7.23].
- **Monster truck:** the somersault now moves it forward at double speed [13.7.22].
- **Race:** nitro for every car (charges in 9 s, Shift = 3x speed for a moment; the monster truck rears up on it); the monster truck's crash is now a forward somersault [13.7.21].
- **Monster truck:** wheelies on a hard start, rolls over 2-3 times if you brake on its back wheels, smoke from the chimneys, fire from the back, and its wheels run agents over [13.7.20].
- **Race:** running over agents now screams, thumps and screeches, and splashes green coolant on the windshield; tyres screech in drifts; sound can be switched off in Settings [13.7.19].
- **Race:** the driver view (C) puts the camera on the front of the vehicle, so the monster truck's body no longer blocks the road [13.7.18].
- **Games:** Play vs agent now works for every game: billiards (aim with the arrows, power, Space shoots) and basketball (stop the meter with Space) join pong, hockey, rock-paper-scissors and dice [13.7.17].
- **Support:** an Ethereum (mainnet) tip address in the sponsor room, the landing page and the README; clicking copies it [13.9.6].
- **Games you can play:** Play vs agent seats you at the table for pong, air hockey, rock-paper-scissors and dice, with your own controls and results saved as "You" [13.7.16].
- **Keys:** Z near an agent opens a numbered Perform picker; popups (weapon pick, reception menu, games) answer to number keys; the weapon pick closes when you leave the anger room [13.1.46].
- **Water cooler chat:** earlier lines float above the newest bubble like a stack of balloons [13.5.12].
- **Bubbles:** the coffee bubble disappears after a few seconds, and room bubbles no longer float above the sidebar or dialogs [13.4.9].
- **Support links:** Patreon and Buy me a coffee are live in the sponsor room, the landing page, the README and the press kit; the repository gets a Sponsor button via `.github/FUNDING.yml` [13.9.5].
- **Water cooler chat:** choosing it from an agent's menu beams the agent and takes you to the water cooler, instead of flying you to his empty desk [13.5.11].
- **Agent dialog:** new Status tab (numbers, caffeine, trophies, Show as…); Actions is shorter and no longer has Fork; Send to… offers Home, Game room and "out of my sight" first [13.1.45].
- **Water cooler chat:** Bye and Topic buttons on the agent's bubble, a topic picker (icon buttons) and 18 new threads in three new topics: Office, Dev and Gossip [13.5.10].
- **Water cooler chat:** your own answer bubble disappears after 5 seconds [13.5.9].
- **Water cooler chat:** the answer buttons in the bubbles can be clicked again; the agent you chat with wakes up and comes to you like a follower [13.5.8].
- **Games:** New game is now two buttons, Autoplay (agent vs agent) and Play vs agent; it calls free agents itself, says so when everyone is busy, and a guest bot fills a seat when only one agent is free [13.7.15]. Rankings tabs are compact icon buttons in one row [13.7.15].
- **Games:** starting a game with no idle agent now wakes a random sleeping one instead of saying nobody is free [13.7.14].
- **Coffee:** the drone brings your cup to wherever you are (also in hand mode); the caffeine level rises when the cup lands and the meter in the agent menu animates up to it [13.1.44].

## 2026-11-22
- **Adapters:** one registry of agent sources (Claude, Codex, OpenCode) drives discovery, liveness, parsing, tool activity and chat history; no more per-source branches in the model [12.1].
- **Desks:** new Settings switch "Desks", off by default: agents sit in a cubicle with a floating laptop instead of a desk [13.1.43].
- **Race:** results go into the Rankings (Race tab, winner vs lower finisher) [13.7.10d]; drivers' bots stand at the track side and watch, and drifting cars leave tyre marks [13.7.10e].
- **Database:** docs mention rewards; tests for schema version, in-memory DB and reopening a file [13.0.5, 13.0.6].
- **Walking:** a robot seated at its desk (or asleep) no longer pushes you out, so you can walk across desks and laptops [13.1.42].
- **Laptop screens:** the nearby open laptop shows the project, model and the agent's latest message, and refreshes every 5 s [13.1.41].
- **Board:** picking a project auto-loads its task list [13.3.7]; redesigned kanban (toned columns, hover cards, drop highlight, compose form) [13.3.1-2]; read-only Backlog.md lane with "Create from template" [13.3.3-5].
- **Hand mode:** click the floor and the camera glides there [13.1.30]; hold and drag to move the camera, grab-the-ground style [13.1.29].
- **Data center:** one rack per project with blinking LEDs, spinning tape reels, hydra cables, data packets, force field and inspector robots [13.2.1-2, 13.2.4].
- **Player/camera:** first visit starts near the plaza, start mode in Settings, E uses the nearest live robot, zoom readout, team name and expanded Perform actions in the agent menu [13.1.3, 13.1.4 (partly), 13.1.6, 13.1.7, 13.1.9 (partly)].
- **Stats:** stacked per-service chart (Claude / Codex / OpenCode) with service toggles, 7/30/90 d range and a "By service" table [13.3.9]; stats now refresh every 30 s and keep history of deleted transcripts [13.3.10].
- **Analytics forever:** usage history now lives in SparkBots' own SQLite file (`~/.agent-office/app.db`, hourly rows), so it outlives deleted transcripts [13.3.11].
- **Data console:** click the computer in the Data center, or press E near it, to open the Data room panel [13.2.7].
- **Merged from parallel sessions:** live reply streaming + "Allow this tool & retry" [7.41 a/b]; OpenCode Stop, run registry and board cards [14.3]; Data center rack aliases, click-a-rack search and renamed strings [13.2.3/5/6]; cubicles, caffeine, rate limit and nervous mode [13.4]; simulated water-cooler chat with 120 threads [13.5]; restaurant, gym extras, anger room and sponsor room [13.6, 13.8]; Codex liveness, stats/search and archived sessions [12.3/5/7]; MCP servers in the Server room [10.6].
- **Games:** framework with table instances and seats, per-agent rankings in SQLite, idle agents pair up and play pong, rock-paper-scissors, dice and air hockey, plus a scoreboard [13.7.1-6, 13.7.11].
- **Launch material:** new README, single-file `landing.html` with a sponsor section, and a `presskit/` with articles and SVG artwork [13.9].
- **Landing page v2:** floating Claude / Codex / OpenCode bots, an animated office with a coffee robot and data-center inspectors, "Supporting", real screenshots, project story, big GitHub button, sponsor last [13.9.5]; screenshot capture script and nicer `?fixture=N` demo data [13.9.6].
- **Press kit:** artwork now stars the logo with the Claude, Codex and OpenCode robots (generated by `presskit/artwork/generate.mjs`); the earlier invented mascot is gone [13.9.8].
- **Landing screenshots:** your hand-taken stats and map shots (map cropped to the sidebar).
- **Teams tab:** redesigned as a ledger with status lights per agent, plain-language flags, a state summary and keyboard-operable rows [13.9.7].
- **Perform menu:** one joined row of seven grey-until-hover icon tiles with a click-to-open explanation; every Perform action wakes a sleeping agent first.
- **Stats:** Refresh button (`POST /api/stats/refresh`).
- **Call to desk / send home:** click a desk to call its agent back, "Call to the desk" in the agent menu, clickable project badge and 🏠 in the menu header [13.1.31].
- **Restaurant:** glass in front of the chef and a kitchen that transforms with the cuisine [13.6.8]; **Fix:** games chips no longer cover the hand buttons, close-up shows Back in hand and walk mode [13.1.32].
- **Cafe and restaurant:** visible glass panes, a cafe barista that brews coffee (steam, stream, filling cup), chef arms and a prep table with flipping food and steam while cooking [13.6.9].
- **Stats ranges:** a "Today" view (hourly) and a month dropdown for every month in the database; the By service table follows the range [13.3.12].
- **Coffee by drone:** ordered coffee brews in 2.5 s at the cafe and a drone flies it to you or the agent [13.6.10].
- **Floating dock:** the side dock now floats over the 3D scene as a translucent force field and the camera re-centres instead of the view being pushed [13.1.33]; restaurant meals arrive by drone carrying the dish icon [13.6.11].
- **Claw machine:** over a prize icon = you get it (no dice, no slipping); clicks in the claw window no longer walk the character [13.7.9b].
- **Go there:** walk when near, beam (dematerialize / materialize) when far, to the centre of the room (not into the data center racks) [13.1.34].
- **Games popover:** two tabs, Rankings and New game [13.7.12]; **Anger room v2** merged (you hold the weapon, more debris, faster waves, exit from reception) [13.8.2c].
- **Stop button:** one big red Stop in the header ends games, smashing (and the race, soon) and flies the camera back to normal [13.7.13]; drone icons and labels no longer draw over the sidebar [13.1.35].
- **Sidebar colours:** each tab tints the sidebar in its own colour, configurable in Settings [13.1.36].
- **Race and Stop:** the race is a special mode ended by the header Stop, its setup lives in Games > New game, missiles fly straight and expire, the rocket kart is much faster; Stop (and Exit at reception) now ends the whole smashing session including its timer [13.7.10g, 13.8.2d].
- **Water cooler chat as bubbles:** the simulated chat now plays as slow typed 3D bubbles above you and the agent, auto-advance or a continue button, replies chosen from an option list, ended by Stop or by walking away [13.5.7].
- **Agent chat tab:** clicking a bot shows Actions and Chat & history tabs; the chat tab is the full live chat, and the dialog is resizable and remembers its size [13.1.37].
- **Desks walk-through:** agent desks no longer block you or the robots [13.1.38].
- **Compact chat composer:** one row, message box up to 15 lines, icon buttons with labels, Archive last and red, Attach as an icon in the box [13.1.39].
- **Chat composer v2:** model and new-worker are buttons in the same one-line button row; errors and notices are toasts; 401s explain where the run is sent [13.1.40].
- **Fix:** API calls with a query string no longer produce a bad token [13.3.8].
- **Tasks:** 13.0 reduced to a small `app.db` for new data; sync, card links and other tasks simplified or deferred; 7.41 split.
