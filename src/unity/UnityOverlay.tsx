import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { useStore } from "../state/store";
import { useUnity } from "./store";
import { UNITY_MAX_TEXT, ago } from "../shared/unity";

const UnityScene = lazy(() => import("./UnityScene"));

const card: React.CSSProperties = { background: "rgba(6,16,11,.86)", border: "1px solid #2f6f4d", borderRadius: 12, color: "#d1fae5", fontSize: 12, padding: "10px 12px", backdropFilter: "blur(6px)" };
const mini: React.CSSProperties = { background: "#12301f", border: "1px solid #2f6f4d", color: "#bbf7d0", borderRadius: 6, padding: "1px 7px", fontSize: 11, cursor: "pointer" };

function Dot({ c }: { c: string }) { return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: c, marginRight: 6, verticalAlign: "middle" }} />; }

/** The 2D side of Unity: who is here (with mute and report), ghosts, the chat line, the way out. Drawn over the Unity scene. */
function Hud() {
  const { room, status, note, muted, reported } = useUnity();
  const { leave, say, mute, report } = useUnity.getState();
  const myColor = useStore((s) => s.managerColor);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [showGhosts, setShowGhosts] = useState(true);
  const peers = Object.values(room.peers);

  useEffect(() => { // Esc: leave the chat box first, then leave Unity; Enter jumps to the chat box
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); if (document.activeElement === input.current) input.current?.blur(); else leave(); }
      else if (e.key === "Enter" && document.activeElement !== input.current) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [leave]);

  const submit = () => { if (text.trim()) { say(text); setText(""); } };
  const ok = status === "online";

  return (
    <>
      <div style={{ position: "absolute", top: 12, left: 12, width: 250, maxHeight: "70%", overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🌀 Unity <span style={{ fontWeight: 400, opacity: 0.7 }}>· public lobby</span></div>
          <div style={{ opacity: 0.75, marginBottom: 6 }}><Dot c={ok ? "#4ade80" : status === "banned" || status === "error" ? "#f87171" : "#fbbf24"} />{ok ? `${peers.length + 1} here` : note || status}</div>
          <div><Dot c={myColor} />You</div>
          {peers.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Dot c={p.color} />{p.name}</span>
              <button style={mini} onClick={() => mute(p.id, !muted.includes(p.id))} title="Hide this person's chat bubbles">{muted.includes(p.id) ? "Unmute" : "Mute"}</button>
              <button style={{ ...mini, opacity: reported.includes(p.id) ? 0.5 : 1 }} disabled={reported.includes(p.id)} onClick={() => report(p.id)} title="Tell the moderator about this person">{reported.includes(p.id) ? "Reported" : "Report"}</button>
            </div>
          ))}
          {peers.length === 0 && ok && <div style={{ opacity: 0.65, marginTop: 4 }}>No one else is here right now.</div>}
        </div>
        {room.ghosts.length > 0 && (
          <div style={card}>
            <button style={{ ...mini, border: 0, background: "none", padding: 0, fontSize: 12 }} onClick={() => setShowGhosts(!showGhosts)}>👻 {room.ghosts.length} ghost{room.ghosts.length === 1 ? "" : "s"} {showGhosts ? "▾" : "▸"}</button>
            {showGhosts && room.ghosts.map((g) => <div key={g.id} style={{ marginTop: 4, opacity: 0.85 }}><Dot c={g.color} />{g.name} <span style={{ opacity: 0.65 }}>· {ago(g.leftAt)}</span></div>)}
          </div>
        )}
      </div>

      <button style={{ position: "absolute", top: 12, right: 12, ...card, cursor: "pointer", padding: "7px 14px", fontWeight: 600 }} onClick={leave} title="Back to the office (Esc)">← Back to the office</button>

      <div style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "min(440px, 92%)" }}>
        {note && !ok && <div style={{ ...card, padding: "5px 12px" }}>{note}</div>}
        <div style={{ ...card, display: "flex", gap: 8, width: "100%", padding: 8, boxSizing: "border-box" }}>
          <input ref={input} value={text} maxLength={UNITY_MAX_TEXT} disabled={!ok} placeholder={ok ? "Say something (Enter)…" : "Not connected"} aria-label="Say something in Unity"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); submit(); } }}
            style={{ flex: 1, background: "#0b1f17", border: "1px solid #2f6f4d", borderRadius: 8, color: "#ecfdf5", padding: "6px 10px", fontSize: 13, minWidth: 0 }} />
          <button style={{ ...mini, padding: "5px 12px", fontSize: 12 }} disabled={!ok || !text.trim()} onClick={submit}>Send</button>
        </div>
        <div style={{ fontSize: 11, color: "#86efac99" }}>WASD / arrows or click to walk · Shift sprints · everyone here can read what you say</div>
      </div>
    </>
  );
}

/** Covers the 3D office while you are inside Unity (the office is paused underneath). */
export function UnityOverlay() {
  const inside = useUnity((s) => s.inside);
  if (!inside) return null;
  return (
    <div className="unity-overlay" role="dialog" aria-label="Unity, the public lobby">
      <ErrorBoundary label="Unity">
        <Suspense fallback={<p style={{ color: "#86efac", padding: 20 }}>Entering Unity…</p>}><UnityScene /></Suspense>
        <Hud />
      </ErrorBoundary>
    </div>
  );
}
