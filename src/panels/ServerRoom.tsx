import { useEffect, useState } from "react";
import { api, poll, fmtAge, type Processes } from "../api";

export function ServerRoom() {
  const [data, setData] = useState<Processes>({ live: [], runs: [] });
  const [err, setErr] = useState("");
  useEffect(() => poll(async () => { try { setData(await api.processes()); setErr(""); } catch (e) { setErr((e as Error).message); } }, 3000), []);
  return (
    <section className="panel">
      <h1>Server Room</h1>
      {err && <p role="alert" style={{ color: "#c33" }}>{err}</p>}
      <h2>Live claude processes</h2>
      <table>
        <thead><tr><th>PID</th><th>Kind</th><th>Directory</th><th>Title</th><th>Uptime</th></tr></thead>
        <tbody>
          {data.live.length === 0 && <tr><td colSpan={5} className="muted">None</td></tr>}
          {data.live.map((p) => (
            <tr key={p.session}><td>{p.pid}</td><td>{p.kind}</td><td className="mono">{p.cwd}</td><td>{p.title}</td><td>{fmtAge(p.startedAt)}</td></tr>
          ))}
        </tbody>
      </table>
      <h2>Office-spawned runs</h2>
      <table>
        <thead><tr><th>Status</th><th>PID</th><th>Directory</th><th>Prompt</th><th>Age</th></tr></thead>
        <tbody>
          {data.runs.length === 0 && <tr><td colSpan={5} className="muted">None</td></tr>}
          {[...data.runs].reverse().map((r) => (
            <tr key={r.runId} style={r.status === "orphaned" ? { background: "#f5a62333", fontWeight: 600 } : undefined}>
              <td>{r.status}</td><td>{r.pid}</td><td className="mono">{r.cwd}</td><td>{r.prompt.slice(0, 60)}</td><td>{fmtAge(r.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
