import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { OpenCodeModel } from "../shared/opencode";

const fmtTokens = (n?: number): string => {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
};

const costOf = (m: OpenCodeModel): string => {
  if (!m.cost) return "cost n/a";
  const { input, output } = m.cost;
  if (!input && !output) return m.provider === "ollama" ? "free · local" : "free";
  const price = (n: number) => (n ? `$${n.toFixed(2)}` : "$0");
  return `${price(input)}/M in · ${price(output)}/M out`;
};

const versionOf = (m: OpenCodeModel): string => {
  if (m.version) return `released ${m.version}`;
  if (m.provider === "ollama") return "local model";
  return m.family || "version not reported";
};

const capabilities = (m: OpenCodeModel): string[] => {
  const out: string[] = [];
  if (m.toolcall) out.push("tools");
  if (m.reasoning) out.push("reasoning");
  for (const kind of m.inputs ?? []) if (kind !== "text") out.push(kind);
  if (m.attachment) out.push("files");
  if (m.status && m.status !== "active") out.push(m.status);
  return out.slice(0, 6);
};

/** Large centered picker for OpenCode models. Chooses one for this chat, or saves it as the global default for new chats. */
export function OpenCodeModelPicker({ current, onPick, onClose }: { current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [models, setModels] = useState<OpenCodeModel[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [selected, setSelected] = useState(current);
  const [provider, setProvider] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    api.opencodeModels().then((r) => { if (live) { setModels(r.models); setLoading(false); } }).catch((e: Error) => { if (live) { setError(e.message); setLoading(false); } });
    api.config().then((c) => { if (live) setDefaultModel(c.opencodeModel); }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const providers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models) counts.set(m.provider, (counts.get(m.provider) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [models]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models
      .filter((m) => !provider || m.provider === provider)
      .filter((m) => !q || `${m.name} ${m.id} ${m.provider} ${m.family ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
  }, [models, provider, query]);

  const currentMissing = !!current && !models.some((m) => m.id === current);
  const defaultMissing = !!defaultModel && !models.some((m) => m.id === defaultModel);
  const makeDefault = async () => {
    setSaving(true); setError("");
    try {
      await api.saveConfig({ opencodeModel: selected });
      setDefaultModel(selected);
      onPick(selected); // use it now too, and close
    } catch (e) { setError((e as Error).message); setSaving(false); }
  };

  return (
    <div className="oc-picker-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="oc-picker" role="dialog" aria-modal="true" aria-label="Choose an OpenCode model">
        <header className="oc-picker-head">
          <div>
            <h2>OpenCode models</h2>
            <p className="muted small">
              {loading ? "Loading from `opencode models --verbose`…" : `${models.length} model${models.length === 1 ? "" : "s"} from ${providers.length} provider${providers.length === 1 ? "" : "s"}`}
              {defaultModel ? <> · default: <b>{defaultModel}</b></> : " · no global default (OpenCode chooses)"}
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div className="oc-picker-tools">
          <input type="search" autoFocus placeholder="Search name, id, family or provider…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider">
            <option value="">All providers ({models.length})</option>
            {providers.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <span className="muted small">{shown.length} shown</span>
        </div>

        {error && <p className="oc-picker-err" role="alert">{error}</p>}
        {loading && <p className="oc-picker-empty">Reading the local OpenCode model list…</p>}
        {!loading && shown.length === 0 && <p className="oc-picker-empty">No model matches this filter.</p>}

        <div className="oc-grid" role="listbox" aria-label="Models">
          <button type="button" role="option" aria-selected={selected === ""} className={`oc-card ${selected === "" ? "on" : ""}`} onClick={() => setSelected("")} onDoubleClick={() => onPick("")}>
            <span className="oc-card-head"><strong>OpenCode default</strong><span className="oc-badge">no --model</span></span>
            <code>let OpenCode choose</code>
            <span className="oc-desc">Use whatever the CLI is configured to use. Useful if you set a default in OpenCode itself.</span>
          </button>

          {currentMissing && (
            <button type="button" role="option" aria-selected={selected === current} className={`oc-card ${selected === current ? "on" : ""}`} onClick={() => setSelected(current)} onDoubleClick={() => onPick(current)}>
              <span className="oc-card-head"><strong>{current}</strong><span className="oc-badge on">this chat</span></span>
              <code>{current}</code>
              <span className="oc-desc">This chat uses it, but the local OpenCode CLI did not list it.</span>
            </button>
          )}

          {shown.map((m) => {
            const caps = capabilities(m);
            return (
              <button type="button" role="option" aria-selected={selected === m.id} className={`oc-card ${selected === m.id ? "on" : ""}`}
                key={m.id} onClick={() => setSelected(m.id)} onDoubleClick={() => onPick(m.id)}>
                <span className="oc-card-head">
                  <strong>{m.name}</strong>
                  <span className="oc-provider">{m.provider}</span>
                  {current === m.id && <span className="oc-badge on">this chat</span>}
                  {defaultModel === m.id && <span className="oc-badge">default</span>}
                </span>
                <code>{m.id}</code>
                <span className="oc-desc">{m.family ? `${m.family} · ` : ""}{versionOf(m)}</span>
                <span className="oc-meta">
                  <span title="Context window">{fmtTokens(m.context)} ctx</span>
                  <span title="Maximum output">{fmtTokens(m.output)} out</span>
                  <span>{costOf(m)}</span>
                </span>
                {caps.length > 0 && <span className="oc-caps">{caps.map((c) => <span className="oc-cap" key={c}>{c}</span>)}</span>}
                {m.variants && m.variants.length > 0 && <span className="oc-variants">variants: {m.variants.slice(0, 6).join(", ")}</span>}
              </button>
            );
          })}
          {defaultMissing && <p className="oc-picker-note">The saved default <b>{defaultModel}</b> is not in the current list. Picking another model or “OpenCode default” replaces it.</p>}
        </div>

        <footer className="oc-picker-foot">
          <div className="oc-selected">
            <span className="muted small">Selected</span>
            <strong>{selected || "OpenCode default"}</strong>
            {selected && selected === defaultModel && <span className="oc-badge">default</span>}
            <span className="muted small">new agents use it unless the project overrides it</span>
          </div>
          <div className="oc-foot-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" onClick={() => onPick(selected)}>Use for this chat</button>
            <button type="button" className="primary" disabled={saving || selected === defaultModel} onClick={() => void makeDefault()}>
              {saving ? "Saving…" : selected === defaultModel ? "Already default" : "Make default"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
