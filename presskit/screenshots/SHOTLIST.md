# Screenshot and GIF shot list

No images are generated here. Capture them yourself.

## General setup

- Start the app (`pnpm build && pnpm start`) and open the printed URL, then add `&fixture=40` at the end so only fake workers appear. Never capture the real project list.
- Browser window 1440 x 900 for stills (retina export if possible). Use 1280 x 720 for GIFs, 12 fps or so, under 8 seconds each.
- Dark theme, hide bookmarks bar and extensions, zoom 100%.
- Turn on `streamingMode` in `config.json` if any real session might be visible.
- Do not show the token in the address bar: crop the browser chrome or use a clean profile.
- Name files `01-campus-overview.png` and so on, and note the date and app version.

## The ten shots

1. **Campus overview (still).** Overview camera, whole campus with team areas and robots in mixed states. Fixture 40. Hero image for README and social.
2. **Status legend and project list (still).** Same view, left sidebar with status counts and project filter open. Shows working / waiting / asleep at a glance.
3. **Amber beacon (GIF, ~5 s).** Walk mode, close to a desk where a robot is waiting; show the pulsing amber beacon and the speech bubble. Pick a waiting robot from the fixture.
4. **Chat panel (still).** Click a robot, open the chat. Use only fixture text. Show the Model box and the queue. Do not send anything to a real session.
5. **Data center (still or GIF).** One rack per project, blinking LEDs, spinning tape reels, cables. Open the Data room panel from the computer for a second frame.
6. **Kanban board (still).** Board panel with the "Send" menu open on a card (message a free worker, fork, new robot) and the Backlog.md lane visible. Use fixture/demo cards only.
7. **Stats by service (still).** Stats panel with the stacked Claude / Codex / OpenCode chart on the 30 d range and the "By service" table. Use fixture data; if the numbers are real, blur them.
8. **Game room (GIF, ~8 s).** Two idle robots at the pong or air hockey table with the scoreboard; second frame of the rankings.
9. **Coffee factory and barista (still).** Barista robot handing a cup to a robot that just started a turn. Wide shot including the coffee station.
10. **Hand mode / fixture 100 stress (GIF, ~6 s).** Switch to `&fixture=100`, drag the camera with hand mode and glide across the floor, showing it stays smooth with many robots.

## Optional extras

- The three robots: export `artwork/bots-trio.svg` to PNG at 2400 px wide.
- Perform actions: short GIF of zap, dance and high-five on one robot.
- Conference room with several robots seated.


## Unity and the pod

`node presskit/screenshots/capture-unity.mjs` takes the Unity pictures (`unity-pod`, `unity-panel`, `unity-lobby`, `unity-town`, `unity-front`, `unity-goodbye`) from a sandbox it starts itself: an empty `HOME` and `AO_HOME`, ports 4398 / 5398, a fixed token, `?fixture=40` for the office and the client-only demo crowd `?unitycrowd=N` for Unity. It does not need `pnpm monitor` and cannot show real sessions. Pass a scene name (`pod`, `panel`, `lobby`, `town`, `front`, `goodbye`) to redo just one. Check every picture before you use it.

## Automatic capture

`node presskit/screenshots/capture.mjs` (with `pnpm monitor` running) takes the app screenshots with headless Chrome: `office-story`, `campus`, `projects-panel`, `game-room`, `board`, `stats`. The 3D shots use `?fixture=40` (demo projects such as "web-shop", "api-gateway"), so no real project names appear. The Board shot is filtered to the `sparkbots` project and the Stats shot is cropped to the chart, so no cost figures or other project names show. Check every image before publishing it.

Do not publish the files in `work/ss/`: they show real project names and message text.

`stats.jpg` and `map.jpg` were taken by hand from the real app and cropped to the sidebar panel (the map shot has no project names; the full-window version showed real chat text and rack labels, so it is not used). Re-running `capture.mjs` overwrites `stats.jpg` with an automatic crop.
