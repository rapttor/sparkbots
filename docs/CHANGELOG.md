# Changelog

Every change is also a task in `docs/TASKS.md` (the id is in brackets). Newest first.

## 2026-11-22
- **Board:** picking a project auto-loads its task list [13.3.7]; redesigned kanban (toned columns, hover cards, drop highlight, compose form) [13.3.1-2]; read-only Backlog.md lane with "Create from template" [13.3.3-5].
- **Hand mode:** click the floor and the camera glides there [13.1.30]; hold and drag to move the camera, grab-the-ground style [13.1.29].
- **Data center:** one rack per project with blinking LEDs, spinning tape reels, hydra cables, data packets, force field and inspector robots [13.2.1-2, 13.2.4].
- **Player/camera:** first visit starts near the plaza, start mode in Settings, E uses the nearest live robot, zoom readout, team name and expanded Perform actions in the agent menu [13.1.3, 13.1.4 (partly), 13.1.6, 13.1.7, 13.1.9 (partly)].
- **Stats:** stacked per-service chart (Claude / Codex / OpenCode) with service toggles, 7/30/90 d range and a "By service" table [13.3.9]; stats now refresh every 30 s and keep history of deleted transcripts [13.3.10].
- **Analytics forever:** usage history now lives in SparkBots' own SQLite file (`~/.agent-office/app.db`, hourly rows), so it outlives deleted transcripts [13.3.11].
- **Data console:** click the computer in the Data center, or press E near it, to open the Data room panel [13.2.7].
- **Fix:** API calls with a query string no longer produce a bad token [13.3.8].
- **Tasks:** 13.0 reduced to a small `app.db` for new data; sync, card links and other tasks simplified or deferred; 7.41 split.
