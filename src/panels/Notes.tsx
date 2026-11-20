import { useState } from "react";
import { call } from "../api";
import { useLive } from "../state/live";
import type { Note } from "../../server/notes";

const COLORS = ["#ffe66d", "#ff9fb2", "#8fd6ff", "#a8e6a1", "#ffbe6b", "#d4b5ff"]; // same palette as server/notes.ts

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [err, setErr] = useState("");
  const refresh = async () => { try { setNotes((await call<{ notes: Note[] }>("GET", "/api/notes")).notes); } catch (e) { setErr((e as Error).message); } };
  useLive(refresh, ["notes"]);
  const guard = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); await refresh(); } catch (e) { setErr((e as Error).message); } };
  const add = () => guard(async () => { await call<Note>("POST", "/api/notes", { text, color }); setText(""); });
  const patch = (id: string, p: Partial<Pick<Note, "text" | "color">>) => guard(() => call<Note>("PATCH", `/api/notes/${id}`, p));

  const swatches = (current: string, pick: (c: string) => void) => COLORS.map((c) => (
    <button key={c} aria-label={`Colour ${c}`} aria-pressed={c === current} onClick={() => pick(c)}
      style={{ background: c, width: 22, height: 22, marginRight: 4, border: c === current ? "2px solid #222" : "1px solid #8886", borderRadius: 4 }} />
  ));

  return (
    <section className="panel">
      <h1>Notes</h1>
      <p className="muted small">The whiteboard in the Manager room. Up to 60 notes, 500 characters each.</p>
      <div>
        <textarea placeholder="New note…" value={text} maxLength={500} rows={3} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} />
        <div>{swatches(color, setColor)} <button disabled={!text.trim()} onClick={add}>Add note</button></div>
      </div>
      {err && <p role="alert" style={{ color: "#c33" }}>{err}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginTop: 8 }}>
        {notes.map((n) => (
          <div key={n.id} style={{ background: n.color, color: "#222", borderRadius: 4, padding: 8 }}>
            <textarea defaultValue={n.text} maxLength={500} rows={4} aria-label="Note text"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== n.text) void patch(n.id, { text: v }); else e.target.value = n.text; }}
              style={{ width: "100%", background: "transparent", color: "inherit", border: "none", resize: "vertical" }} />
            <div>
              {swatches(n.color, (c) => void patch(n.id, { color: c }))}
              <button onClick={() => void guard(() => call("DELETE", `/api/notes/${n.id}`))} aria-label="Delete note">×</button>
            </div>
          </div>
        ))}
        {!notes.length && <p className="muted small">No notes yet.</p>}
      </div>
    </section>
  );
}
