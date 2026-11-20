import { useState } from "react";
import { api, fmtAge, type Processes } from "../api";
import { useLive } from "../state/live";

/** Stacked cards instead of wide tables, so it reads well in the narrow dock. */
export function ServerRoom() {
  const [data, setData] = useState<Processes>({ live: [], runs: [] });
  const [err, setErr] = useState("");
  useLive(async () => { try { setData(await api.processes()); setErr(""); } catch (e) { setErr((e as Error).message); } }, ["processes", "runs"]);
  return (
    <section className="panel">
      <h1>Server Room</h1>
      {err && <p role="alert" style={{ color: "#c33" }}>{err}</p>}

      <h2>Live claude processes</h2>
      {data.live.length === 0 && <p className="muted">None</p>}
      <div className="cards">
        {data.live.map((p) => (
          <div className="card" key={p.session}>
            <div className="card-top"><strong title={p.title}>{p.title || "(untitled)"}</strong><span className="muted small">{fmtAge(p.startedAt)}</span></div>
            <div className="card-meta"><span className="tag">{p.kind}</span><span className="muted small">pid {p.pid}</span></div>
            <div className="mono small card-path" title={p.cwd}>{p.cwd}</div>
          </div>
        ))}
      </div>

      <h2>Runs started from SparkBots</h2>
      {data.runs.length === 0 && <p className="muted">None</p>}
      <div className="cards">
        {[...data.runs].reverse().map((r) => (
          <div className={`card ${r.status === "orphaned" ? "card-warn" : ""}`} key={r.runId}>
            <div className="card-top"><span className={`tag s-${r.status}`}>{r.status}</span><span className="muted small">{fmtAge(r.startedAt)} · pid {r.pid}</span></div>
            <div className="card-text">{r.prompt.slice(0, 120)}</div>
            <div className="mono small card-path" title={r.cwd}>{r.cwd}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
