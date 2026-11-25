import { lazy, Suspense, useEffect } from "react";
import { BRAND } from "./shared/brand";
import { startSync, useStore } from "./state/store";
import { PanelMenu } from "./dock/PanelMenu";
import { Dock } from "./dock/Dock";
import { Dialog } from "./dock/Dialog";
import { useNarrow } from "./dock/useLayout";
import { dockVisible, panelShowing } from "./state/dock";
import logo from "./assets/rapttor/rapttor_logo-green.png";
import logotype from "./assets/rapttor/rapttor_logo-text-green.png";
import { OWNER } from "./shared/owner";
import { ErrorBoundary } from "./ErrorBoundary";
import { FilterBar } from "./panels/FilterBar";
import { StopModes } from "./dock/StopModes";
import { api } from "./api";
import { useLive } from "./state/live";
import { makeFixtureSnapshot } from "./world/fixture";
import { UnityOverlay } from "./unity/UnityOverlay";
import { useUnity } from "./unity/store";

const World = lazy(() => import("./world/World"));


/** How many px of the 3D view the floating dock covers on a side (0 for the bottom sheet or a hidden dock). */
const dockInset = (dock: { side: "left" | "right"; width: number } & Parameters<typeof dockVisible>[0], narrow: boolean, side: "left" | "right") =>
  !narrow && dockVisible(dock) && dock.side === side ? dock.width : 0;

export function App() {
  const { connected, snapshot, dock } = useStore();
  const setPanel = useStore((s) => s.setPanel);
  const narrow = useNarrow();
  useEffect(() => {
    // ?fixture=N renders N fake workers (3D performance check) instead of live data
    const n = Number(new URLSearchParams(location.search).get("fixture"));
    if (n > 0) { useStore.setState({ snapshot: makeFixtureSnapshot(n), connected: true }); return; }
    return startSync();
  }, []);

  useLive(async () => { try { useStore.setState({ tasks: await api.tasks() }); } catch { /* ignore */ } }, ["tasks"]);

  // the 3D office is always on screen; its keys pause while a dialog (or, on a phone, the bottom sheet) covers it
  const inUnity = useUnity((s) => s.inside);
  const worldActive = !dock.dialog && !(narrow && dock.open) && !inUnity; // inside Unity the office is paused underneath
  return (
    <div className="shell">
      <header className="topbar">
        <button className={`brand-btn ${panelShowing(dock, "about") ? "on" : ""}`} title={`About ${OWNER.name}, the maker of ${BRAND.name}`} aria-label={`About ${OWNER.name}`} onClick={() => setPanel("about")}>
          <img src={logo} alt="" width={26} height={22} /><strong>{BRAND.name}</strong>
        </button>
        <FilterBar />
        <div id="topbar-slot" className="topbar-slot" />
        <StopModes />
        <span className="spacer" />
        <PanelMenu />
      </header>
      <div className="body" style={{ "--dock-l": `${dockInset(dock, narrow, "left")}px`, "--dock-r": `${dockInset(dock, narrow, "right")}px` } as React.CSSProperties}>
        <main className={`stage${inUnity ? " unity-on" : ""}`}>
          <ErrorBoundary label="the 3D office"><Suspense fallback={<p className="muted">Loading the 3D office…</p>}><World active={worldActive} /></Suspense></ErrorBoundary>
          <UnityOverlay />
        </main>
        <Dock narrow={narrow} />
      </div>
      <footer className="footer">
        <span className={connected ? "dot ok" : "dot bad"} />
        {connected ? "Connected" : "Reconnecting…"}
        <span className="spacer" />
        <button className="made-by" title={`About ${OWNER.name}`} onClick={() => setPanel("about")}>made by <img src={logotype} alt={OWNER.name} height={9} /></button>
        Skipped lines: {snapshot?.skippedLines ?? 0}
      </footer>
      <Dialog />
    </div>
  );
}
