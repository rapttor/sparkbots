import { useEffect, useState } from "react";
import { api, type SearchHit } from "../api";
import { useStore } from "../state/store";
import { relTime } from "../util";

/** "[[word]]" markers from the search snippet become highlighted text. */
function Snippet({ text }: { text: string }) {
  return <>{text.split(/(\[\[.*?\]\])/g).map((p, i) => (p.startsWith("[[") ? <mark key={i}>{p.slice(2, -2)}</mark> : <span key={i}>{p}</span>))}</>;
}

/** Search everything your agents said, across all projects. The index is a local file; nothing leaves your machine. */
export function DataRoom() {
  const snapshot = useStore((s) => s.snapshot);
  const openChat = useStore((s) => s.openChat);
  const setPanel = useStore((s) => s.setPanel);
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<{ sessions: number; messages: number; building: boolean } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const t = setInterval(() => { api.searchStatus().then(setStatus).catch(() => {}); }, 3000);
    api.searchStatus().then(setStatus).catch(() => {});
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { api.search(q, team).then((h) => { setHits(h); setErr(""); }).catch((e: Error) => setErr(e.message)); }, 250);
    return () => clearTimeout(t);
  }, [q, team]);
  const go = (h: SearchHit) => { if (h.archived) return; useStore.getState().selectWorker(h.session); };
  return (
    <section className="panel">
      <h1>Data room</h1>
      <p className="muted small">
        Search everything your agents said. {status ? `${status.messages.toLocaleString()} messages from ${status.sessions} sessions indexed${status.building ? " (still indexing…)" : ""}.` : ""}
      </p>
      <div className="tb-row">
        <input className="tb-search" autoFocus type="search" placeholder="Search conversations… (words match by prefix)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {(snapshot?.teams ?? []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      {err && <p role="alert" className="small" style={{ color: "#e5484d" }}>{err}</p>}
      {q.trim().length >= 2 && hits.length === 0 && !err && <p className="muted">No matches{status?.building ? " yet (indexing is still running)" : ""}.</p>}
      {hits.map((h, i) => (
        <div key={i} className="hit" onClick={() => go(h)} style={{ cursor: h.archived ? "default" : "pointer" }}>
          <div className="small"><b>{h.name || h.title}</b> <span className="muted">· {h.team} · {h.role} · {h.at ? relTime(h.at) : ""}{h.archived ? " · archived" : ""}</span></div>
          <div className="hit-text"><Snippet text={h.snippet} /></div>
        </div>
      ))}
    </section>
  );
}
