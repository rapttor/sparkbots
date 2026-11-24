import { useEffect, useRef } from "react";
import { sendView } from "./viewBus";

/** Zoom and turn buttons floating in the 3D view (bottom right). Hold a button to keep going; the same as the keys [ ] (turn) and - = (zoom). */
function HoldButton({ label, title, step }: { label: string; title: string; step: () => void }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);
  return (
    <button className="vb" aria-label={title} title={title}
      onPointerDown={(e) => { e.preventDefault(); stop(); step(); timer.current = setInterval(step, 70); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onBlur={stop}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); step(); } }}>{label}</button>
  );
}

export function ViewButtons() {
  return (
    <div className="view-btns" role="group" aria-label="Camera">
      <HoldButton label="＋" title="Zoom in (=)" step={() => sendView({ t: "zoom", factor: 0.95 })} />
      <HoldButton label="−" title="Zoom out (-)" step={() => sendView({ t: "zoom", factor: 1.05 })} />
      <HoldButton label="↶" title="Turn the view left ([)" step={() => sendView({ t: "angle", dyaw: 0.06, dpitch: 0 })} />
      <HoldButton label="↷" title="Turn the view right (])" step={() => sendView({ t: "angle", dyaw: -0.06, dpitch: 0 })} />
    </div>
  );
}
