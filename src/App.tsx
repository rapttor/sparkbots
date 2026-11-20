import { lazy, Suspense, useEffect, useState } from "react";
import { BRAND } from "./shared/brand";
import { startSync, useStore, type PanelId } from "./state/store";
import { Teams } from "./panels/Teams";
import { ControlRoom } from "./panels/ControlRoom";
import { Stats } from "./panels/Stats";
import { WorkerPanel } from "./panels/Worker";
import { Board } from "./panels/Board";
import { Settings } from "./panels/Settings";
import { ServerRoom } from "./panels/ServerRoom";
import { FilterBar } from "./panels/FilterBar";
import { api, poll } from "./api";
import { makeFixtureSnapshot } from "./world/fixture";

const World = lazy(() => import("./world/World"));

const MENU: { id: PanelId; label: string }[] = [
  { id: "world", label: "Office (3D)" },
  { id: "teams", label: "Teams" },
  { id: "control", label: "Control Room" },
  { id: "stats", label: "Stats" },
  { id: "board", label: "Board" },
  { id: "server", label: "Server Room" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const { panel, setPanel, connected, snapshot, selectedWorker } = useStore();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // ?fixture=N renders N fake workers (3D performance check) instead of live data
    const n = Number(new URLSearchParams(location.search).get("fixture"));
    if (n > 0) { useStore.setState({ snapshot: makeFixtureSnapshot(n), connected: true, panel: "world" }); return; }
    return startSync();
  }, []);

  useEffect(() => poll(async () => {
    try { useStore.setState({ tasks: await api.tasks() }); } catch { /* ignore */ }
  }, 10000), []);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon-btn" aria-label="Toggle menu" onClick={() => setOpen(!open)}>☰</button>
        <strong>{BRAND.name}</strong>
        <FilterBar />
        <div id="topbar-slot" className="topbar-slot" />
      </header>
      <div className="body">
        {open && (
          <nav className="sidebar">
            {MENU.map((m) => (
              <button key={m.id} className={m.id === panel ? "active" : ""} onClick={() => setPanel(m.id)}>
                {m.label}
              </button>
            ))}
          </nav>
        )}
        <main className="main">
          {panel === "world" && <Suspense fallback={<p className="muted">Loading…</p>}><World /></Suspense>}
          {panel === "teams" && <Teams />}
          {panel === "control" && <ControlRoom />}
          {panel === "stats" && <Stats />}
          {panel === "board" && <Board />}
          {panel === "server" && <ServerRoom />}
          {panel === "settings" && <Settings />}
        </main>
        {selectedWorker && <WorkerPanel />}
      </div>
      <footer className="footer">
        <span className={connected ? "dot ok" : "dot bad"} />
        {connected ? "Connected" : "Reconnecting…"}
        <span className="spacer" />
        Skipped lines: {snapshot?.skippedLines ?? 0}
      </footer>
    </div>
  );
}
