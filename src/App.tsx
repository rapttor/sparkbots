import { lazy, Suspense, useEffect } from "react";
import { BRAND } from "./shared/brand";
import { startSync, useStore } from "./state/store";
import { PanelMenu } from "./dock/PanelMenu";
import { Dock } from "./dock/Dock";
import { Dialog } from "./dock/Dialog";
import { useNarrow } from "./dock/useLayout";
import { ErrorBoundary } from "./ErrorBoundary";
import { FilterBar } from "./panels/FilterBar";
import { api } from "./api";
import { useLive } from "./state/live";
import { makeFixtureSnapshot } from "./world/fixture";

const World = lazy(() => import("./world/World"));


export function App() {
  const { connected, snapshot, dock } = useStore();
  const narrow = useNarrow();
  useEffect(() => {
    // ?fixture=N renders N fake workers (3D performance check) instead of live data
    const n = Number(new URLSearchParams(location.search).get("fixture"));
    if (n > 0) { useStore.setState({ snapshot: makeFixtureSnapshot(n), connected: true }); return; }
    return startSync();
  }, []);

  useLive(async () => { try { useStore.setState({ tasks: await api.tasks() }); } catch { /* ignore */ } }, ["tasks"]);

  // the 3D office is always on screen; its keys pause while a dialog (or, on a phone, the bottom sheet) covers it
  const worldActive = !dock.dialog && !(narrow && dock.open);
  return (
    <div className="shell">
      <header className="topbar">
        <strong>{BRAND.name}</strong>
        <FilterBar />
        <div id="topbar-slot" className="topbar-slot" />
        <span className="spacer" />
        <PanelMenu />
      </header>
      <div className="body">
        <main className="stage">
          <ErrorBoundary label="the 3D office"><Suspense fallback={<p className="muted">Loading the 3D office…</p>}><World active={worldActive} /></Suspense></ErrorBoundary>
        </main>
        <Dock narrow={narrow} />
      </div>
      <footer className="footer">
        <span className={connected ? "dot ok" : "dot bad"} />
        {connected ? "Connected" : "Reconnecting…"}
        <span className="spacer" />
        Skipped lines: {snapshot?.skippedLines ?? 0}
      </footer>
      <Dialog />
    </div>
  );
}
