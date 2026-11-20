import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Config, type Teams } from "../api";
import { useStore } from "../state/store";

type NumKey = "historyDays" | "idleThresholdSec" | "asleepAfterMin" | "doneWaveSec" | "errorSec";
const NUMS: { key: NumKey; label: string; desc: string; words: string }[] = [
  { key: "historyDays", label: "History window (days)", desc: "Sessions older than this and not running are left out of the office (archived).", words: "archive old sessions days desks hidden recent" },
  { key: "idleThresholdSec", label: "Idle threshold (sec)", desc: "A worker with no activity for this long counts as idle instead of working.", words: "idle working quiet timeout status" },
  { key: "asleepAfterMin", label: "Asleep after (min)", desc: "No process and no activity for this long makes a worker asleep (eyes closed, lying down).", words: "sleep asleep zzz bed inactive timeout" },
  { key: "doneWaveSec", label: "Done wave (sec)", desc: "How long a robot waves after it finishes a turn.", words: "finished done wave animation arm" },
  { key: "errorSec", label: "Error display (sec)", desc: "How long a worker stays in the error state before returning to idle.", words: "error red failure display" },
];

/** One searchable option. `words` are hidden keywords so a search finds it by related terms, not only its label. */
interface Opt { id: string; section: string; label: string; desc: string; words: string; body: ReactNode; wide?: boolean }
const norm = (s: string) => s.toLowerCase();
const matches = (o: Opt, q: string) => {
  const hay = norm(`${o.section} ${o.label} ${o.desc} ${o.words}`);
  return q.split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
};
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
function Field({ o }: { o: Opt }) {
  return (
    <div className={`opt ${o.wide ? "opt-wide" : ""}`} id={`opt-${o.id}`}>
      <div className="opt-text">
        <div className="opt-label">{o.label}</div>
        <div className="muted small">{o.desc}</div>
      </div>
      <div className="opt-body">{o.body}</div>
    </div>
  );
}
const MODES = ["", "default", "acceptEdits", "plan"];
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

interface Row { name: string; globs: string; color: string; tools: string; mode: string }
type Msg = { ok: boolean; text: string } | null;

function Status({ m }: { m: Msg }) {
  return m ? <span className={m.ok ? "muted small" : "small"} style={m.ok ? undefined : { color: "#e5484d" }}>{m.text}</span> : null;
}

function toRows(t: Teams): Row[] {
  const names = new Set([...Object.keys(t.merges), ...Object.keys(t.colors), ...Object.keys(t.overrides)]);
  return [...names].sort().map((name) => ({
    name,
    globs: (t.merges[name] ?? []).join("\n"),
    color: t.colors[name] ?? "",
    tools: (t.overrides[name]?.allowedTools ?? []).join(", "),
    mode: t.overrides[name]?.permissionMode ?? "",
  }));
}

function toTeams(rows: Row[]): Teams {
  const t: Teams = { schemaVersion: 1, merges: {}, colors: {}, overrides: {} };
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const globs = list(r.globs);
    if (globs.length) t.merges[name] = globs;
    if (r.color) t.colors[name] = r.color;
    const tools = list(r.tools);
    if (tools.length || r.mode) {
      t.overrides[name] = {};
      if (tools.length) t.overrides[name].allowedTools = tools;
      if (r.mode) t.overrides[name].permissionMode = r.mode;
    }
  }
  return t;
}

export function Settings() {
  const managerColor = useStore((s) => s.managerColor);
  const setManagerColor = useStore((s) => s.setManagerColor);
  const snapshot = useStore((s) => s.snapshot);
  const markAllSeen = useStore((s) => s.markAllSeen);
  const setFilters = useStore((s) => s.setFilters);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [cfgMsg, setCfgMsg] = useState<Msg>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [teamMsg, setTeamMsg] = useState<Msg>(null);
  const [hooks, setHooks] = useState<{ installed: boolean; settingsPath: string } | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState(() => ls.get("ao.settingsSection") ?? "All");
  const pick = (v: string) => { setSection(v); ls.set("ao.settingsSection", v); };
  const [, bump] = useState(0); // re-render after writing a browser-only setting

  useEffect(() => {
    api.config().then(setCfg).catch((e: Error) => setLoadErr(e.message));
    api.teams().then((t) => setRows(toRows(t))).catch((e: Error) => setLoadErr(e.message));
    api.hooks().then(setHooks).catch(() => setHooks(null));
  }, []);

  const saveCfg = async (next: Config) => {
    setCfgMsg(null);
    try {
      const { port: _port, schemaVersion: _v, ...rest } = next;
      setCfg(await api.saveConfig(rest));
      setCfgMsg({ ok: true, text: "Saved." });
    } catch (e) { setCfgMsg({ ok: false, text: (e as Error).message }); }
  };
  const saveTeams = async () => {
    setTeamMsg(null);
    try {
      setRows(toRows(await api.saveTeams(toTeams(rows))));
      setTeamMsg({ ok: true, text: "Saved." });
    } catch (e) { setTeamMsg({ ok: false, text: (e as Error).message }); }
  };
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const flag = (k: string) => ls.get(k) === "1";
  const setFlag = (k: string, v: boolean) => { ls.set(k, v ? "1" : "0"); bump((n) => n + 1); };
  const cfgSaved = <Status m={cfgMsg} />;

  const opts: Opt[] = [
    { id: "manager-color", section: "3D office", label: "Manager color", words: "player robot walk avatar colour",
      desc: "The robot you walk around the 3D office with. Saved in this browser.",
      body: <input type="color" value={managerColor} onChange={(e) => setManagerColor(e.target.value)} /> },
    { id: "zoom-lock", section: "3D office", label: "Lock zoom", words: "camera wheel scroll distance freeze",
      desc: "Start with the zoom locked: the mouse wheel and the zoom buttons stop changing the camera distance. Also in the header.",
      body: <label><input type="checkbox" checked={flag("ao.zoomLock")} onChange={(e) => setFlag("ao.zoomLock", e.target.checked)} /> Zoom locked</label> },
    { id: "minimap", section: "3D office", label: "Minimap", words: "map overview radar corner",
      desc: "Show the small top-down map in the 3D room. Also in the header.",
      body: <label><input type="checkbox" checked={flag("ao.minimap")} onChange={(e) => setFlag("ao.minimap", e.target.checked)} /> Show minimap</label> },
    { id: "chat-dock", section: "3D office", label: "Chat window position", words: "pin dock left right float side panel bubble",
      desc: "Where the robot chat opens: floating over the scene, or pinned to the left or right so the scene stays visible.",
      body: (
        <select value={ls.get("ao.chatDock") ?? "float"} onChange={(e) => { ls.set("ao.chatDock", e.target.value); bump((n) => n + 1); }}>
          <option value="float">Floating over the scene</option><option value="left">Pinned left</option><option value="right">Pinned right</option>
        </select>) },
    { id: "show-all-map", section: "3D office", label: "Show finished / abandoned projects", words: "labels hidden map archive onMap",
      desc: "Projects labelled Finished or Abandoned are left off the map unless this is on.",
      body: <label><input type="checkbox" checked={flag("ao.map.showAll")} onChange={(e) => setFlag("ao.map.showAll", e.target.checked)} /> Show them</label> },
    { id: "clear-bubbles", section: "3D office", label: "Speech bubbles", words: "unseen messages read clear mark",
      desc: "Bubbles appear over robots with a message you have not read. Mark them all as read.",
      body: <button onClick={() => { const m: Record<string, number> = {}; for (const t of snapshot?.teams ?? []) for (const w of t.workers) if (w.said) m[w.id] = w.said.at; markAllSeen(m); }}>Mark all as read</button> },
    { id: "reset-filters", section: "General", label: "Reset header filters", words: "search status labels sort open tasks clear",
      desc: "Clear the search, status, label and task filters shown in the header.",
      body: <button onClick={() => setFilters({ search: "", statuses: [], labels: [], openTasks: false, sort: "latest" })}>Reset filters</button> },
    { id: "streaming", section: "General", label: "Streaming mode", words: "hide preview messages screen share privacy bubbles text streamer",
      desc: "Hide message previews and speech bubbles, for screen sharing or recording.",
      body: cfg && <label><input type="checkbox" checked={cfg.streamingMode} onChange={(e) => void saveCfg({ ...cfg, streamingMode: e.target.checked })} /> Hide message text {cfgSaved}</label> },
    ...NUMS.map((n): Opt => ({
      id: n.key, section: "Worker states", label: n.label, desc: n.desc, words: n.words,
      body: cfg && <><input type="number" min={0} value={cfg[n.key]} onChange={(e) => setCfg({ ...cfg, [n.key]: Number(e.target.value) })}
        onBlur={() => void saveCfg(cfg)} /> {cfgSaved}</>,
    })),
    { id: "port", section: "Server", label: "Port", words: "network localhost listen restart",
      desc: "The local port the server listens on. Changing it needs a restart (edit ~/.agent-office/config.json).",
      body: cfg && <input type="number" value={cfg.port} readOnly disabled /> },
    { id: "hooks", section: "Server", wide: true, label: "Hooks", words: "claude settings install uninstall events precise state",
      desc: "Optional Claude Code hooks make worker states exact. Install or remove them from a terminal.",
      body: <>
        <p>{hooks ? (hooks.installed ? "Hooks installed." : "Hooks not installed.") : "Hooks status unavailable."} {hooks && <span className="muted small mono">{hooks.settingsPath}</span>}</p>
        <p className="mono small">pnpm start hooks install<br />pnpm start hooks uninstall</p>
      </> },
    { id: "teams", section: "Projects", wide: true, label: "Project teams, permissions and tools", words: "merge directories globs allowedTools permissionMode acceptEdits plan bypass color team override name",
      desc: "Merge directories into one team with globs, give a team a color, and set which tools and permission mode runs in it use. Bypass is never offered.",
      body: <>
        {rows.map((r, i) => (
          <div key={i} className="opt-team">
            <p>
              <input placeholder="Team name" value={r.name} onChange={(e) => patch(i, { name: e.target.value })} />{" "}
              <input type="color" aria-label="Color" value={r.color || "#888888"} onChange={(e) => patch(i, { color: e.target.value })} />{" "}
              <button onClick={() => setRows(rows.filter((_, k) => k !== i))}>Remove</button>
            </p>
            <p><textarea rows={2} style={{ width: "100%" }} placeholder="/path/to/project*" value={r.globs} onChange={(e) => patch(i, { globs: e.target.value })} /></p>
            <p>
              <input placeholder="allowedTools (comma list)" value={r.tools} onChange={(e) => patch(i, { tools: e.target.value })} />{" "}
              <select aria-label="Permission mode" value={r.mode} onChange={(e) => patch(i, { mode: e.target.value })}>
                {MODES.map((m) => <option key={m} value={m}>{m || "(user default)"}</option>)}
              </select>
            </p>
          </div>
        ))}
        <button onClick={() => setRows([...rows, { name: "", globs: "", color: "", tools: "", mode: "" }])}>Add team</button>{" "}
        <button onClick={() => void saveTeams()}>Save</button> <Status m={teamMsg} />
      </> },
  ];

  const q = norm(query.trim());
  const found = useMemo(() => opts.filter((o) => !q || matches(o, q)), [opts, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = [...new Set(opts.map((o) => o.section))];
  const count = (sec: string) => found.filter((o) => o.section === sec).length;
  const active = all.includes(section) ? section : "All";
  const shown = found.filter((o) => active === "All" || o.section === active);
  const sections = [...new Set(shown.map((o) => o.section))];

  return (
    <section className="settings">
      <aside className="settings-nav">
        <h1>Settings</h1>
        <input type="search" autoFocus placeholder="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} />
        <nav role="tablist" aria-label="Setting sections">
          {["All", ...all].map((sec) => (
            <button key={sec} role="tab" aria-selected={active === sec} className={active === sec ? "active" : ""} onClick={() => pick(sec)}>
              <span>{sec}</span><span className="muted small">{sec === "All" ? found.length : count(sec)}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="settings-main">
        {loadErr && <p className="small" style={{ color: "#e5484d" }}>{loadErr}</p>}
        {shown.length === 0 && <p className="muted">No setting matches “{query}”.</p>}
        {sections.map((sec) => (
          <div key={sec} className="settings-group">
            <h2>{sec}</h2>
            <div className="settings-card">
              {shown.filter((o) => o.section === sec).map((o) => <Field key={o.id} o={o} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
