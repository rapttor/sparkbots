import { useState } from "react";
import { api, fmtAge, type Processes, type McpProject } from "../api";
import { useLive } from "../state/live";

/** Stacked cards instead of wide tables, so it reads well in the narrow dock. */
export function ServerRoom() {
  const [data, setData] = useState<Processes>({ live: [], runs: [] });
  const [mcp, setMcp] = useState<McpProject[]>([]);
  const [err, setErr] = useState("");
  useLive(async () => { try { setData(await api.processes()); setMcp((await api.mcp()).projects); setErr(""); } catch (e) { setErr((e as Error).message); } }, ["processes", "runs"]);
  return (
    <section className="panel">
      <h1>Server room</h1>
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
            <div className="card-top"><span className={`tag s-${r.status}`}>{r.status}</span><span className="muted small">{fmtAge(r.startedAt)} · pid {r.pid}</span>
              {r.status === "running" && <button className="small" title="Stop this run (SIGTERM to the process SparkBots started)" onClick={() => api.stop(r.runId).catch((e) => setErr((e as Error).message))}>Stop</button>}</div>
            <div className="card-text">{r.prompt.slice(0, 120)}</div>
            <div className="mono small card-path" title={r.cwd}>{r.cwd}</div>
          </div>
        ))}
      </div>

      <h2>MCP servers (configured)</h2>
      <p className="muted small">Read from config files only. Env and header values are hidden. Nothing is started here.</p>
      {mcp.length === 0 && <p className="muted">None found</p>}
      {mcp.map((p) => (
        <div key={p.project || "user"}>
          <div className="mono small card-path" title={p.project}>{p.project || "User-level (all projects)"}</div>
          <div className="cards">
            {p.servers.map((m) => (
              <div className="card" key={`${m.source}:${m.name}`}>
                <div className="card-top"><strong>{m.name}</strong><span className="tag">{m.type}</span></div>
                <div className="card-meta"><span className="muted small">{m.scope} · {m.source}{m.disabled ? " · disabled" : ""}</span></div>
                <div className="mono small card-path" title={m.url ?? m.command}>{m.url ?? [m.command, ...(m.args ?? [])].join(" ")}</div>
                {m.envKeys.length > 0 && <div className="muted small">env: {m.envKeys.join(", ")}</div>}
                {m.headerKeys.length > 0 && <div className="muted small">headers: {m.headerKeys.join(", ")}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
