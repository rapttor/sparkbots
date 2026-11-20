import { useState } from "react";
import { call } from "../api";
import { useLive } from "../state/live";

type Kind = "ollama" | "lmstudio" | "llamacpp" | "opencode" | "openai-compatible" | "other";
const KINDS: Kind[] = ["ollama", "lmstudio", "llamacpp", "opencode", "openai-compatible", "other"];
interface Status { up: boolean; latencyMs?: number; version?: string; models?: string[]; loaded?: string[]; error?: string }
interface Item { id: string; kind: Kind; name: string; url: string; hasToken: boolean; status?: Status }
interface Found extends Item { registered: boolean; status: Status }
interface ScanResult { candidates: Found[]; processes: { name: string; pid: number }[] }

const dot = (s?: Status) => <span aria-label={s ? (s.up ? "up" : "down") : "unknown"} style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: !s ? "#999" : s.up ? "#2a9d4b" : "#c33" }} />;

export function Services() {
  const [items, setItems] = useState<Item[]>([]);
  const [scan, setScan] = useState<ScanResult | undefined>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: "", url: "", kind: "ollama" as Kind, token: "" });
  const [range, setRange] = useState({ open: false, cidr: "192.168.1.0/24", port: "11434" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => { try { setItems(await call<Item[]>("GET", "/api/services")); setErr(""); } catch (e) { setErr((e as Error).message); } };
  useLive(refresh, ["services"]);
  const guard = async (fn: () => Promise<unknown>) => { setErr(""); setBusy(true); try { await fn(); await refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  const runScan = (body?: object) => guard(async () => { setScan(await call<ScanResult>("POST", "/api/services/scan", body ?? {})); setPicked(new Set()); });
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (!n.delete(id)) n.add(id); return n; });
  const adopt = () => guard(async () => { await call("POST", "/api/services/adopt", { ids: [...picked] }); setScan(undefined); });
  const add = () => guard(async () => { await call("POST", "/api/services", { ...form, token: form.token || undefined }); setForm({ ...form, name: "", url: "", token: "" }); });

  return (
    <section className="panel">
      <h1>Services</h1>
      <p className="muted">AI services that run as servers (Ollama, LM Studio, llama.cpp, OpenCode ...). Tokens stay on the server.</p>
      {err && <p role="alert" style={{ color: "#c33" }}>{err}</p>}
      {items.length === 0 && <p className="muted">No services yet. Try "Scan local".</p>}
      <div className="cards">
        {items.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-top">
              <strong>{dot(s.status)} {s.name}{s.status?.version ? <span className="muted small"> v{s.status.version}</span> : null}</strong>
              <span className="tag">{s.kind}</span>
            </div>
            <div className="mono small card-path" title={s.url}>{s.url}</div>
            <div className="small">
              {s.status?.latencyMs !== undefined ? `${s.status.latencyMs} ms` : s.status?.error ?? "not tested"}
              {s.status?.loaded?.length ? <> · loaded: <b>{s.status.loaded.join(", ")}</b></> : null}
            </div>
            {s.status?.models?.length ? <div className="muted small card-models">{s.status.models.length} model{s.status.models.length === 1 ? "" : "s"}: {s.status.models.slice(0, 8).join(", ")}{s.status.models.length > 8 ? ", …" : ""}</div> : null}
            <div className="card-actions">
              <button className="small" disabled={busy} onClick={() => guard(() => call("POST", `/api/services/${encodeURIComponent(s.id)}/test`))}>Test</button>
              <button className="small" disabled={busy} onClick={() => guard(() => call("DELETE", `/api/services/${encodeURIComponent(s.id)}`))}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <h2>Scan</h2>
      <button disabled={busy} onClick={() => runScan()}>Scan local</button>{" "}
      <button disabled={busy} onClick={() => setRange({ ...range, open: !range.open })}>Scan a network range</button>
      {range.open && (
        <form onSubmit={(e) => { e.preventDefault(); void runScan({ range: range.cidr, port: Number(range.port) }); }}>
          <p role="note"><strong>Only scans the range you type; nothing is scanned automatically.</strong> Private ranges up to a /24.</p>
          <input aria-label="Range" value={range.cidr} onChange={(e) => setRange({ ...range, cidr: e.target.value })} placeholder="192.168.1.0/24" />{" "}
          <input aria-label="Port" value={range.port} onChange={(e) => setRange({ ...range, port: e.target.value })} size={6} />{" "}
          <button type="submit" disabled={busy}>Scan range</button>
        </form>
      )}
      {scan && (
        <div>
          <h3>Found</h3>
          {scan.candidates.length === 0 && <p className="muted">Nothing found.</p>}
          {scan.candidates.map((c) => (
            <label key={c.id} style={{ display: "block" }}>
              <input type="checkbox" disabled={c.registered} checked={picked.has(c.id)} onChange={() => toggle(c.id)} /> {dot(c.status)} {c.name} <span className="mono">{c.url}</span>
              {c.registered && <span className="muted"> (already added)</span>}
            </label>
          ))}
          {scan.candidates.length > 0 && <button disabled={busy || picked.size === 0} onClick={adopt}>Add selected</button>}
          {scan.processes.length > 0 && (
            <p className="muted">Running processes: {scan.processes.map((p) => `${p.name} (pid ${p.pid})`).join(", ")}</p>
          )}
        </div>
      )}

      <h2>Add manually</h2>
      <form onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input aria-label="Name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />{" "}
        <input aria-label="URL" placeholder="http://127.0.0.1:11434" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />{" "}
        <select aria-label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>{" "}
        <input aria-label="Token" type="password" placeholder="Token (optional)" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} autoComplete="off" />{" "}
        <button type="submit" disabled={busy || !form.name || !form.url}>Add</button>
      </form>
    </section>
  );
}
