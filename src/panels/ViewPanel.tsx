import type { ReactNode } from "react";
import { useStore } from "../state/store";
import { sendView } from "../world/viewBus";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="vp-row"><span className="muted small vp-label">{label}</span><span className="vc-group">{children}</span></div>;
}

/** The 3D office's camera and display controls: one continuous zoom (first-person ↔ overview), turn, reset and what is shown. */
export function ViewPanel() {
  const info = useStore((s) => s.viewInfo);
  const keymap = useStore((s) => s.showKeymap);
  const setKeymap = useStore((s) => s.setShowKeymap);
  return (
    <section className="panel">
      <h1>View</h1>
      <p className="muted small">One camera: scroll / pinch to zoom. Zoom in for first-person, zoom out for the top-down overview. Right-drag or A/D turns the view.</p>

      <h2>Camera</h2>
      <Row label="Zoom">
        <button className="small" disabled={info.locked} onClick={() => sendView({ t: "zoom", factor: 0.8 })} aria-label="Zoom in">＋</button>
        <button className="small" disabled={info.locked} onClick={() => sendView({ t: "zoom", factor: 1.25 })} aria-label="Zoom out">−</button>
        <button className={`small ${info.locked ? "fb-on" : ""}`} onClick={() => sendView({ t: "lock" })} title="The mouse wheel and the zoom buttons stop changing the distance (L)">{info.locked ? "🔒 Locked" : "🔓 Lock"}</button>
      </Row>
      <Row label="Turn">
        <button className="small" onClick={() => sendView({ t: "angle", dyaw: 0.2, dpitch: 0 })} aria-label="Turn view left">↶</button>
        <button className="small" onClick={() => sendView({ t: "angle", dyaw: -0.2, dpitch: 0 })} aria-label="Turn view right">↷</button>
        <button className="small" onClick={() => sendView({ t: "reset" })} title="Camera behind you at the default zoom (C)">Behind</button>
      </Row>
      <Row label="Default">
        <button className="small" onClick={() => sendView({ t: "reset" })} title="Back to the default view (0)">⟲ Reset view</button>
        <button className="small" onClick={() => sendView({ t: "saveDefault" })} title="Remember this camera as the default">⭐ Save as default</button>
        {info.hasDefault && <button className="small" onClick={() => sendView({ t: "clearDefault" })}>Clear default</button>}
      </Row>

      <h2>Show</h2>
      <label className="vp-check"><input type="checkbox" checked={info.tags} onChange={() => sendView({ t: "tags" })} /> Name tags over agents <kbd>T</kbd></label>
      <label className="vp-check"><input type="checkbox" checked={keymap} onChange={(e) => setKeymap(e.target.checked)} /> Keymap legend</label>
    </section>
  );
}
