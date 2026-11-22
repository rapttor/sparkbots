import { lazy, Suspense, useEffect } from "react";
import { BRAND } from "./shared/brand";
import { startSync, useStore } from "./state/store";
import { PanelMenu } from "./dock/PanelMenu";
import { Dock } from "./dock/Dock";
import { Dialog } from "./dock/Dialog";
import { useNarrow } from "./dock/useLayout";
import { dockVisible } from "./state/dock";
import { ErrorBoundary } from "./ErrorBoundary";
import { FilterBar } from "./panels/FilterBar";
import { StopModes } from "./dock/StopModes";
import { api } from "./api";
import { useLive } from "./state/live";
import { makeFixtureSnapshot } from "./world/fixture";

const World = lazy(() => import("./world/World"));


/** How many px of the 3D view the floating dock covers on a side (0 for the bottom sheet or a hidden dock). */
const dockInset = (dock: { side: "left" | "right"; width: number } & Parameters<typeof dockVisible>[0], narrow: boolean, side: "left" | "right") =>
  !narrow && dockVisible(dock) && dock.side === side ? dock.width : 0;

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
        <StopModes />
        <span className="spacer" />
        <PanelMenu />
      </header>
      <div className="body" style={{ "--dock-l": `${dockInset(dock, narrow, "left")}px`, "--dock-r": `${dockInset(dock, narrow, "right")}px` } as React.CSSProperties}>
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
