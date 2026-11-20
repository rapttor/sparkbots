import type { ReactNode } from "react";
import { useStore } from "../state/store";
import { sendView } from "../world/viewBus";
import { Icon } from "../dock/icons";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="vp-row"><span className="muted small vp-label">{label}</span><span className="vc-group">{children}</span></div>;
}

/** The 3D office's camera and display controls: view mode on top, then zoom, pan, angle, the saved default view and what is shown. */
export function ViewPanel() {
  const info = useStore((s) => s.viewInfo);
  const counts = useStore((s) => s.showStatusCounts);
  const setCounts = useStore((s) => s.setShowStatusCounts);
  const keymap = useStore((s) => s.showKeymap);
  const setKeymap = useStore((s) => s.setShowKeymap);
  const walk = info.mode === "walk";
  return (
    <section className="panel">
      <h1>View</h1>

      <h2>View mode</h2>
      <div className="seg" role="radiogroup" aria-label="View mode">
        <button role="radio" aria-checked={!walk} className={!walk ? "on" : ""} onClick={() => sendView({ t: "mode", mode: "overview" })}><Icon name="map" size={16} /> Overview</button>
        <button role="radio" aria-checked={walk} className={walk ? "on" : ""} onClick={() => sendView({ t: "mode", mode: "walk" })}><Icon name="teams" size={16} /> Walk</button>
      </div>
      <p className="muted small">{walk ? "WASD or click the floor to move, hold Shift to sprint, right-drag turns the view, E talks to the nearby agent." : "Drag to orbit, right-drag to pan, scroll to zoom, double-click a project to walk in. Key V switches."}</p>

      <h2>Camera</h2>
      <Row label="Zoom">
        <button className="small" disabled={info.locked} onClick={() => sendView({ t: "zoom", factor: 0.8 })} aria-label="Zoom in">＋</button>
        <button className="small" disabled={info.locked} onClick={() => sendView({ t: "zoom", factor: 1.25 })} aria-label="Zoom out">−</button>
        <button className={`small ${info.locked ? "fb-on" : ""}`} onClick={() => sendView({ t: "lock" })} title="The mouse wheel and the zoom buttons stop changing the distance (L)">{info.locked ? "🔒 Locked" : "🔓 Lock"}</button>
      </Row>
      <Row label="Pan">
        <button className="small" disabled={walk} onClick={() => sendView({ t: "pan", right: 0, forward: 0.15 })} aria-label="Pan forward">↑</button>
        <button className="small" disabled={walk} onClick={() => sendView({ t: "pan", right: 0, forward: -0.15 })} aria-label="Pan back">↓</button>
        <button className="small" disabled={walk} onClick={() => sendView({ t: "pan", right: -0.15, forward: 0 })} aria-label="Pan left">←</button>
        <button className="small" disabled={walk} onClick={() => sendView({ t: "pan", right: 0.15, forward: 0 })} aria-label="Pan right">→</button>
        {walk && <span className="muted small">follows you</span>}
      </Row>
      <Row label="Angle">
        <button className="small" onClick={() => sendView({ t: "angle", dyaw: 0.2, dpitch: 0 })} aria-label="Turn view left">↶</button>
        <button className="small" onClick={() => sendView({ t: "angle", dyaw: -0.2, dpitch: 0 })} aria-label="Turn view right">↷</button>
        <button className="small" onClick={() => sendView({ t: "angle", dyaw: 0, dpitch: 0.1 })} aria-label="Camera higher">⤒</button>
        <button className="small" onClick={() => sendView({ t: "angle", dyaw: 0, dpitch: -0.1 })} aria-label="Camera lower">⤓</button>
      </Row>
      <Row label="Default">
        <button className="small" onClick={() => sendView({ t: "reset" })} title="Back to the default view (0)">⟲ Reset view</button>
        <button className="small" onClick={() => sendView({ t: "saveDefault" })} title="Remember this camera as the default">⭐ Save as default</button>
        {info.hasDefault && <button className="small" onClick={() => sendView({ t: "clearDefault" })}>Clear default</button>}
      </Row>

      <h2>Show</h2>
      <label className="vp-check"><input type="checkbox" checked={info.tags} onChange={() => sendView({ t: "tags" })} /> Name tags over agents <kbd>T</kbd></label>
      <label className="vp-check"><input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} /> Status counts in the corner</label>
      <label className="vp-check"><input type="checkbox" checked={keymap} onChange={(e) => setKeymap(e.target.checked)} /> Keymap legend</label>
    </section>
  );
}
