import { useEffect, useRef, useState } from "react";
import { api, type NerdInfo } from "../api";
import { nerd } from "../state/nerd";
import { useStore } from "../state/store";

const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${Math.round(n)} B`);
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function Block({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="nerd-block">
      <h3>{title}</h3>
      <div className="nerd-grid">{rows.map(([k, v]) => <span key={k} style={{ display: "contents" }}><span className="muted">{k}</span><b>{v}</b></span>)}</div>
    </div>
  );
}

/** Technical numbers: how the 3D view performs, how much data the socket moves, and how the server is doing. */
export function NerdStats() {
  const [, tick] = useState(0);
  const [srv, setSrv] = useState<NerdInfo | null>(null);
  const [err, setErr] = useState("");
  const snapshot = useStore((s) => s.snapshot);
  const last = useRef({ at: performance.now(), msgs: 0, bytes: 0, rate: { msgs: 0, kbs: 0 } });
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now(), dt = (now - last.current.at) / 1000, w = nerd.ws;
      if (dt >= 1) { last.current = { at: now, msgs: w.messages, bytes: w.bytes, rate: { msgs: (w.messages - last.current.msgs) / dt, kbs: (w.bytes - last.current.bytes) / dt } }; }
      tick((n) => n + 1);
    }, 500);
    const load = () => { api.nerd().then((d) => { setSrv(d); setErr(""); }).catch((e: Error) => setErr(e.message)); };
    load();
    const s = setInterval(load, 2000);
    return () => { clearInterval(t); clearInterval(s); };
  }, []);

  const w = nerd.ws, mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const agents = snapshot?.teams.reduce((n, t) => n + t.workers.length, 0) ?? 0;
  const secs = Math.max(1, (Date.now() - w.since) / 1000);
  return (
    <>
      <h2>Nerd stats</h2>
      <p className="muted small">Live technical numbers. The 3D numbers fill in once you have opened the 3D office, and they pause while another panel is on screen.</p>
      {err && <p role="alert" className="small" style={{ color: "#e5484d" }}>{err}</p>}
      <div className="nerd">
        <Block title="3D view (this browser)" rows={[
          ["Frames per second", nerd.fps ? nerd.fps.toFixed(0) : "–"],
          ["Frame time (avg / worst)", nerd.fps ? `${nerd.frameMs.toFixed(1)} / ${nerd.worstMs.toFixed(1)} ms` : "–"],
          ["Draw calls", String(nerd.calls)], ["Triangles", nerd.triangles.toLocaleString()],
          ["GPU geometries / textures", `${nerd.geometries} / ${nerd.textures}`],
          ["Robots simulated", String(nerd.bots)], ["Floating titles", String(nerd.labels)],
          ["JS heap", mem ? kb(mem.usedJSHeapSize) : "n/a (Chrome only)"],
        ]} />
        <Block title="Live connection" rows={[
          ["Messages (rate)", `${w.messages.toLocaleString()}  (${last.current.rate.msgs.toFixed(1)}/s)`],
          ["Traffic", `${kb(w.bytes)}  (${kb(last.current.rate.kbs)}/s)`],
          ["Full snapshots (hello)", `${w.hello}  last ${kb(w.lastHelloBytes)}`],
          ["Patches", `${w.patch}  last ${kb(w.lastPatchBytes)} / ${w.lastPatchOps} ops`],
          ["Pings (changed)", String(w.changed)], ["Resyncs after a gap", String(w.resyncs)],
          ["Avg traffic since load", `${kb((w.bytes / secs))}/s`],
          ["Agents in browser", String(agents)],
        ]} />
        {srv && <Block title="Server" rows={[
          ["Node / pid", `${srv.node} / ${srv.pid}`], ["Uptime", dur(srv.uptimeS)],
          ["Memory (rss / heap)", `${kb(srv.memory.rss)} / ${kb(srv.memory.heapUsed)} of ${kb(srv.memory.heapTotal)}`],
          ["Event-loop lag (avg / worst)", `${srv.lag.avgMs.toFixed(1)} / ${srv.lag.maxMs.toFixed(0)} ms`],
          ["Browsers connected", String(srv.sockets.clients)], ["Sync revision", String(srv.sockets.rev)],
          ["Full snapshot size", kb(srv.snapshotBytes)],
          ["Runs (running / kept)", `${srv.runs.running} / ${srv.runs.total}`],
        ]} />}
        {srv && <Block title="Data" rows={[
          ["Sessions (known / live)", `${srv.sessions.known} / ${srv.sessions.live}`],
          ["By state", Object.entries(srv.sessions.byState).map(([k, n]) => `${k} ${n}`).join(" · ") || "–"],
          ["Search index", `${srv.index.messages.toLocaleString()} messages, ${srv.index.sessions} sessions, ${kb(srv.index.fileBytes)}${srv.index.building ? " (indexing…)" : ""}`],
          ["Sessions with stats", String(srv.stats.sessionsWithStats)], ["History spans", String(srv.stats.historySpans)],
          ["Skipped transcript lines", String(srv.stats.skippedLines)],
        ]} />}
      </div>
    </>
  );
}
