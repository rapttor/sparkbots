import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type ArchivedItem, type Config, type Teams } from "../api";
import { useLive } from "../state/live";
import { useWidth } from "../dock/useLayout";
import { runProblem } from "../world/runStatus";
import { rateLimitedAt } from "../world/rateLimit";
import { DOCK_COLOR_LABELS, dockColor, resetDockColors, setDockColor, useDockColorVersion } from "../state/dockColors";
import { useStore } from "../state/store";
import { KEYMAP, KEY_TABS, keyCaps } from "../world/keymap";
import { listAvatars } from "../world/avatar";
import { LOGO_EMOJIS, TOP_STYLES, type TopStyle } from "../world/devLook";
import { DEFAULT_FILTERS } from "./teamFilters";
import type { OpenCodeModel } from "../shared/opencode";
import { getShowDesks, setShowDesks } from "../state/deskPref";
import { soundOn, setSound } from "../world/sfx";
import { getSettings as getSimChat, setSettings as setSimChat, type ChatAdvance, type ChatFilter, type ChatSpeed } from "../simchat/settings";

type NumKey = "historyDays" | "idleThresholdSec" | "asleepAfterMin" | "doneWaveSec" | "errorSec";
const NUMS: { key: NumKey; label: string; desc: string; words: string }[] = [
  { key: "historyDays", label: "History window (days)", desc: "Sessions older than this and not running are left out of the office (archived).", words: "archive old sessions days desks hidden recent" },
  { key: "idleThresholdSec", label: "Idle threshold (sec)", desc: "A worker with no activity for this long counts as idle instead of working.", words: "idle working quiet timeout status" },
  { key: "asleepAfterMin", label: "Asleep after (min)", desc: "No process and no activity for this long makes a worker asleep (eyes closed, lying down).", words: "sleep asleep zzz bed inactive timeout" },
  { key: "doneWaveSec", label: "Done wave (sec)", desc: "How long a robot waves after it finishes a turn.", words: "finished done wave animation arm" },
  { key: "errorSec", label: "Error display (sec)", desc: "How long a worker stays in the error state before returning to idle.", words: "error red failure display" },
];

/** One searchable option. `words` are hidden keywords so a search finds it by related terms, not only its label.
 *  `form` renders it compactly (label left, control right, description behind an (i) toggle, no row lines). */
interface Opt { id: string; section: string; label: string; desc: string; words: string; body: ReactNode; wide?: boolean; form?: boolean }
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

/** Compact form row: label + (i) on the left, control on the right; the description opens below the whole row. */
function FormField({ o }: { o: Opt }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="opt form" id={`opt-${o.id}`}>
      <div className="form-left">
        <span className="opt-label">{o.label}</span>
        <button type="button" className="form-info" aria-label="More information" aria-expanded={open} onClick={() => setOpen((v) => !v)}>i</button>
      </div>
      <div className="opt-body form-control">{o.body}</div>
      {open && <div className="form-desc muted small">{o.desc}</div>}
    </div>
  );
}
const MODES = ["", "default", "acceptEdits", "plan"];
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

interface Row { name: string; globs: string; color: string; cwd: string; source: string; model: string; tools: string; mode: string }
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
    cwd: t.overrides[name]?.cwd ?? "",
    source: t.overrides[name]?.source ?? "",
    model: t.overrides[name]?.model ?? "",
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
    const cwd = r.cwd.trim(), model = r.model.trim();
    if (tools.length || r.mode || cwd || r.source || model) {
      t.overrides[name] = {};
      if (tools.length) t.overrides[name].allowedTools = tools;
      if (r.mode) t.overrides[name].permissionMode = r.mode;
      if (cwd) t.overrides[name].cwd = cwd;
      if (r.source) t.overrides[name].source = r.source as "claude" | "codex" | "opencode";
      if (model) t.overrides[name].model = model;
    }
  }
  return t;
}

/** What the next run will use (host name only, never tokens) and a button that tries it. */
function ClaudeSetup() {
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof api.claudeSetup>> | null>(null);
  const [run, setRun] = useState<string>("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useLive(async () => {
    try { setSetup(await api.claudeSetup()); } catch { /* ignore */ }
    if (!run) return;
    try {
      const r = (await api.runs()).find((x) => x.runId === run);
      if (!r || r.status === "running") return;
      const lines = await api.runLog(run);
      const problem = runProblem(lines);
      const reply = [...lines].reverse().find((l) => l.type === "result");
      setResult(problem ? { ok: false, text: problem.text } : r.status === "done" ? { ok: true, text: String(reply?.result ?? "ok").slice(0, 200) } : { ok: false, text: `The run ended as "${r.status}"` });
      setBusy(false); setRun("");
    } catch { /* transient */ }
  }, ["runs"]);
  const start = async () => {
    setBusy(true); setResult(null);
    try { setRun((await api.testRun()).runId); } catch (e) { setResult({ ok: false, text: (e as Error).message }); setBusy(false); }
  };
  return (
    <div>
      {setup && (
        <p className="small">
          Next run: model <b>{setup.model}</b>{" · "}
          {setup.inheritedGatewayHost ? <>gateway <b>{setup.inheritedGatewayHost}</b> (from the server's environment)</> : "no gateway variable inherited"}
          {setup.inheritedToken ? " · an auth token variable is inherited" : ""}
        </p>
      )}
      <button disabled={busy} onClick={() => void start()}>{busy ? "Running…" : "Test run"}</button>{" "}
      {result && <span className={result.ok ? "s-working small" : "small"} style={result.ok ? undefined : { color: "#e5484d" }}>{result.ok ? "✓ " : "✖ "}{result.text}</span>}
    </div>
  );
}

/** Start one new agent in this project, using the row's (unsaved) cwd/source/model as the hire config. */
function HireBox({ team, cwd, source, model }: { team: string; cwd: string; source: string; model: string }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const hire = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.hire({ team: team.trim(), cwd: cwd.trim() || undefined, source: source || undefined, model: model.trim() || undefined, prompt: prompt.trim() });
      setMsg({ ok: true, text: `Hired ${r.source}${r.model ? ` (${r.model})` : ""} in ${r.cwd}` });
      setPrompt("");
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <p className="settings-hire">
      <input placeholder={`Opening prompt for the new ${source || "claude"} agent`} value={prompt} maxLength={2000}
        onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void hire(); }} />
      <button disabled={busy || !team.trim() || !prompt.trim()} onClick={() => void hire()}>{busy ? "Hiring…" : "Hire"}</button>{" "}
      <Status m={msg} />
    </p>
  );
}

function ArchiveList() {
  const [items, setItems] = useState<ArchivedItem[]>([]);
  useLive(async () => { try { setItems(await api.archived()); } catch { /* ignore */ } }, ["archive"]);
  if (!items.length) return <p className="muted small">Nothing archived.</p>;
  return (
    <div>
      {items.map((i) => (
        <div key={i.id} className="kmap-row">
          <span style={{ flex: 1 }}>{i.name || i.title} <span className="muted small">{i.team} · {new Date(i.at).toLocaleDateString()}</span></span>
          <button className="small" onClick={() => void api.archive(i.id, false).then(() => api.archived().then(setItems)).catch(() => {})}>Restore</button>
        </div>
      ))}
    </div>
  );
}

export function Settings() {
  useDockColorVersion(); // the colour pickers repaint as you pick
  const managerColor = useStore((s) => s.managerColor);
  const setManagerColor = useStore((s) => s.setManagerColor);
  const avatar = useStore((s) => s.avatar);
  const setAvatar = useStore((s) => s.setAvatar);
  const devLook = useStore((s) => s.devLook);
  const setDevLook = useStore((s) => s.setDevLook);
  const viewInfo = useStore((s) => s.viewInfo);
  const controller = useStore((s) => s.controller);
  const setController = useStore((s) => s.setController);
  const snapshot = useStore((s) => s.snapshot);
  const markAllSeen = useStore((s) => s.markAllSeen);
  const showKeymap = useStore((s) => s.showKeymap);
  const setShowKeymap = useStore((s) => s.setShowKeymap);
  const setFilters = useStore((s) => s.setFilters);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [cfgMsg, setCfgMsg] = useState<Msg>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [teamMsg, setTeamMsg] = useState<Msg>(null);
  const [hooks, setHooks] = useState<{ installed: boolean; settingsPath: string } | null>(null);
  const [ocModels, setOcModels] = useState<OpenCodeModel[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [query, setQuery] = useState("");
  const [wrap, width] = useWidth<HTMLElement>();
  const compact = width > 0 && width < 700; // narrow dock or phone: the section list becomes a dropdown on top
  const [section, setSection] = useState(() => ls.get("ao.settingsSection") ?? "All");
  const pick = (v: string) => { setSection(v); ls.set("ao.settingsSection", v); };
  const [, bump] = useState(0); // re-render after writing a browser-only setting

  useEffect(() => {
    api.config().then(setCfg).catch((e: Error) => setLoadErr(e.message));
    api.teams().then((t) => setRows(toRows(t))).catch((e: Error) => setLoadErr(e.message));
    api.hooks().then(setHooks).catch(() => setHooks(null));
    api.opencodeModels().then((r) => setOcModels(r.models)).catch(() => setOcModels([]));
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
    { id: "sound", section: "3D office", label: "Sound effects", words: "sound audio scream screech noise mute volume race",
      desc: "Small sounds made in your browser (screams and tyre screech in the race). Nothing is downloaded. Off silences them.",
      body: <label><input type="checkbox" checked={soundOn()} onChange={(e) => { setSound(e.target.checked); bump((n) => n + 1); }} /> Play sound effects</label> },
    { id: "show-desks", section: "3D office", label: "Desks", words: "desk furniture table cubicle laptop floating hide show",
      desc: "Off (default): each agent sits in a glass cubicle with a laptop floating in it. On: the desk furniture is drawn under the laptop. Desks are walk-through either way.",
      body: <label><input type="checkbox" checked={getShowDesks()} onChange={(e) => { setShowDesks(e.target.checked); bump((n) => n + 1); }} /> Show desks</label> },
    { id: "dock-colors", section: "3D office", label: "Sidebar colours", words: "sidebar dock colour color tab theme tint panel accent glow",
      desc: "Each sidebar tab tints the sidebar in its own colour (edge, header and background). Pick a colour per tab; Reset restores the defaults.",
      body: <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 6 }}>
        {DOCK_COLOR_LABELS.map((d) => (
          <label key={d.key} className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="color" value={dockColor(d.key)} onChange={(e) => setDockColor(d.key, e.target.value)} aria-label={`${d.label} colour`} /> {d.label}
          </label>
        ))}
        <button className="small" onClick={resetDockColors}>Reset colours</button>
      </div> },
    { id: "controller", section: "Owner", form: true, label: "Controls", words: "avatar hand mouse pointer black white controller walk mode",
      desc: "Avatar: walk the office with WASD. Hand: a floating hand in the middle of the screen — move the mouse to glide it (faster when zoomed out, slower when zoomed in), A/D to turn, W/S to tilt, scroll to zoom. Click an agent to open it; close the menu to let go.",
      body: <select value={controller} onChange={(e) => setController(e.target.value as "avatar" | "hand")}>
        <option value="avatar">Avatar (walk)</option>
        <option value="hand">Hand</option>
      </select> },
    { id: "avatar", section: "Owner", form: true, label: "Character", words: "owner player avatar character look choose raptor dinosaur spark robot manager",
      desc: "The character you walk the 3D office with. Saved in this browser.",
      body: <select value={avatar} onChange={(e) => setAvatar(e.target.value)}>
        {listAvatars().map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select> },
    { id: "manager-color", section: "Owner", form: true, label: "Pants color", words: "player robot walk avatar colour character tint jeans pants trousers bottom",
      desc: "The colour of your character's jeans (developer) or body (raptor/spark bot). Saved in this browser.",
      body: <input type="color" value={managerColor} onChange={(e) => setManagerColor(e.target.value)} /> },
    { id: "dev-top-color", section: "Owner", form: true, label: "Top color", words: "developer shirt hoodie tshirt turtleneck plaid clothes colour top",
      desc: "The colour of the developer's top (hoodie, t-shirt, turtleneck or squared-lines shirt).",
      body: <input type="color" value={devLook.topColor} onChange={(e) => setDevLook({ topColor: e.target.value })} /> },
    { id: "dev-top-style", section: "Owner", form: true, label: "Top style", words: "developer clothes hoodie tshirt turtleneck plaid squared lines shirt",
      desc: "What the developer wears. The squared-lines shirt weaves the top and pants colours together.",
      body: <select value={devLook.top} onChange={(e) => setDevLook({ top: e.target.value as TopStyle })}>
        {TOP_STYLES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select> },
    { id: "dev-logo", section: "Owner", form: true, label: "Shirt logo", words: "developer emoji badge patch front back chest shirt print",
      desc: "An emoji printed on the front of the developer's top, plus a bigger one (2x) on the back that you see from the follow camera.",
      body: <select value={devLook.logo} onChange={(e) => setDevLook({ logo: e.target.value })}>
        {LOGO_EMOJIS.map((e) => <option key={e || "none"} value={e}>{e || "(none)"}</option>)}
      </select> },
    { id: "dev-glasses", section: "Owner", form: true, label: "Glasses", words: "developer square glasses spectacles eyewear",
      desc: "Square glasses for the developer.",
      body: <input type="checkbox" checked={devLook.glasses} onChange={(e) => setDevLook({ glasses: e.target.checked })} /> },
    { id: "dev-beard", section: "Owner", form: true, label: "Beard", words: "developer full beard facial hair",
      desc: "A full beard for the developer.",
      body: <input type="checkbox" checked={devLook.beard} onChange={(e) => setDevLook({ beard: e.target.checked })} /> },
    { id: "dev-overweight", section: "Owner", form: true, label: "Overweight", words: "developer belly chubby overweight",
      desc: "A bit of a belly for the developer.",
      body: <input type="checkbox" checked={devLook.overweight} onChange={(e) => setDevLook({ overweight: e.target.checked })} /> },
    { id: "zoom-lock", section: "3D office", label: "Lock zoom", words: "camera wheel scroll distance freeze",
      desc: "Start with the zoom locked: the mouse wheel and the zoom buttons stop changing the camera distance. Also in the header.",
      body: <label><input type="checkbox" checked={flag("ao.zoomLock")} onChange={(e) => setFlag("ao.zoomLock", e.target.checked)} /> Zoom locked</label> },
    { id: "start-mode", section: "3D office", label: "Start mode", words: "spawn start position plaza saved view first visit walk avatar begin",
      desc: "Where you appear when the office opens. First visit (no saved view) is always near the plaza; with a saved view, \"Saved view\" keeps the campus-edge start and \"Near the plaza\" always starts in the middle.",
      body: <select value={ls.get("ao.startMode") ?? "saved"} onChange={(e) => { ls.set("ao.startMode", e.target.value); bump((n) => n + 1); }}>
        <option value="saved">Saved view (plaza on first visit)</option><option value="plaza">Always near the plaza</option>
      </select> },
    { id: "zoom-max", section: "3D office", label: "Maximum zoom-out", words: "zoom max limit distance campus fit readout camera",
      desc: "How far the camera can pull back, and the distance at which the whole campus fits. Measured from the current layout.",
      body: <span>{viewInfo.maxDist} m max (campus fits at about {viewInfo.fitDist} m; now {viewInfo.zoomPct}%)</span> },
    { id: "space-map", section: "3D office", label: "Space opens the quick map", words: "teleport map minimap space bar click go fly hotkey",
      desc: "Press Space in the 3D office for a map overlay: click anywhere to fly there. Ignored while you type.",
      body: <label><input type="checkbox" checked={ls.get("ao.spaceMap") !== "0"} onChange={(e) => { ls.set("ao.spaceMap", e.target.checked ? "1" : "0"); bump((n) => n + 1); }} /> Enable Space</label> },
    { id: "fly-speed", section: "3D office", label: "Camera fly speed", words: "camera move transition flight smooth animated go there reset close-up fast normal",
      desc: "How fast the camera flies to its next spot (Go there, reset, close-up). Fast is fine; it never jumps.",
      body: <select value={ls.get("ao.flySpeed") ?? "normal"} onChange={(e) => { ls.set("ao.flySpeed", e.target.value); bump((n) => n + 1); }}>
        <option value="normal">Normal</option><option value="fast">Fast</option>
      </select> },
    { id: "no-intro", section: "3D office", label: "Opening shot", words: "intro animation start camera zoom top view skip splash",
      desc: "When SparkBots opens, the camera starts above the whole campus and sinks slowly towards your character. Any scroll, key or click skips it.",
      body: <label><input type="checkbox" checked={!flag("ao.noIntro")} onChange={(e) => setFlag("ao.noIntro", !e.target.checked)} /> Play the opening shot</label> },
    { id: "reduced-motion", section: "3D office", label: "Reduced motion", words: "accessibility animation camera flight fade short motion sickness",
      desc: "Use short fades instead of long camera flights, for less motion.",
      body: <label><input type="checkbox" checked={flag("ao.reducedMotion")} onChange={(e) => setFlag("ao.reducedMotion", e.target.checked)} /> Reduce camera motion</label> },
    { id: "show-all-map", section: "3D office", label: "Show finished / abandoned projects", words: "labels hidden map archive onMap",
      desc: "Projects labelled Finished or Abandoned are left off the map unless this is on.",
      body: <label><input type="checkbox" checked={flag("ao.map.showAll")} onChange={(e) => setFlag("ao.map.showAll", e.target.checked)} /> Show them</label> },
    { id: "clear-bubbles", section: "3D office", label: "Speech bubbles", words: "unseen messages read clear mark",
      desc: "Bubbles appear over robots with a message you have not read. Mark them all as read.",
      body: <button onClick={() => { const m: Record<string, number> = {}; for (const t of snapshot?.teams ?? []) for (const w of t.workers) if (w.said) m[w.id] = w.said.at; markAllSeen(m); }}>Mark all as read</button> },
    { id: "data-center", section: "3D office", label: "Data center and Data room names", words: "data center datacenter data room server room rack alias rename label search conversations",
      desc: "The Data center is the 3D room with one rack per project; the Data room is its search panel; the Server room panel lists live processes. Rename the room or a rack by clicking its title in the Data room panel.",
      body: <button onClick={() => useStore.getState().setPanel("data")}>Open the Data room</button> },
    { id: "rate-limited", section: "General", label: "Rate limited (nervous mode)", words: "429 usage limit quota nervous red bubbles jitter anxious cosmetic",
      desc: "Switches on automatically when a run hits a 429 / usage limit. Turn it on by hand to see the office nervous: bubbles turn red and robots twitch. Cosmetic only; working agents keep working. Lasts 2 hours unless switched off.",
      body: <label><input type="checkbox" checked={rateLimitedAt(snapshot?.rateLimitedUntil)} onChange={(e) => void api.setRateLimit(e.target.checked).catch(() => {})} /> {rateLimitedAt(snapshot?.rateLimitedUntil) ? "Rate limited" : "Not limited"}</label> },
    { id: "reset-filters", section: "General", label: "Reset header filters", words: "search status labels sort open tasks clear",
      desc: "Clear the search, status, label and task filters shown in the header.",
      body: <button onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button> },
    { id: "keymap-show", section: "Keymap", label: "Show the keymap in the 3D view", words: "legend keys shortcuts help instructions hotkeys bindings",
      desc: "The clickable list of keys and mouse actions in the corner of the 3D office. Entries you can do right now are buttons; the others are greyed with the reason. Also in the View menu.",
      body: <label><input type="checkbox" checked={showKeymap} onChange={(e) => setShowKeymap(e.target.checked)} /> Show keymap</label> },
    { id: "keymap-list", section: "Keymap", wide: true, label: "All keys and mouse actions", words: "keys shortcuts hotkeys zap walk talk minimap zoom reset escape bindings",
      desc: "To run one, open the 3D office and click it in the keymap there (it is greyed when it cannot be done at that moment).",
      body: <div>{KEY_TABS.map((t) => <div key={t.id}><h5 style={{ margin: "10px 0 4px" }}>{t.icon} {t.label}</h5>{KEYMAP.filter((k) => (k.tab ?? "basics") === t.id).map((k) => <div key={k.id} className="kmap-row"><span className="kmap-keys">{keyCaps(k.keys).map((c) => <span key={c} className="kmap-key">{c}</span>)}</span><span>{k.label}</span></div>)}</div>)}</div> },
    { id: "run-model", section: "Claude runs", label: "Model for runs", words: "claude model opus sonnet haiku default alias --model",
      desc: "The model used when you message an agent from SparkBots. Leave empty to use Claude Code's default. You can also choose a model per message in the chat.",
      body: cfg && <><input placeholder="(default)" value={cfg.runModel} maxLength={80} onChange={(e) => setCfg({ ...cfg, runModel: e.target.value.trim() })} onBlur={() => void saveCfg(cfg)} /> {cfgSaved}</> },
    { id: "clean-env", section: "Claude runs", label: "Clean environment", words: "anthropic gateway token base url api key proxy opencode env variables 401",
      desc: "Start runs without the ANTHROPIC_* variables (gateway URL, tokens) that the shell running SparkBots exported, and without your user-level ~/.claude/settings.json (its env block can set a gateway and model aliases too; project settings still apply). Turn it on if runs fail with authentication or 'model not found' errors.",
      body: cfg && <label><input type="checkbox" checked={cfg.cleanEnv} onChange={(e) => void saveCfg({ ...cfg, cleanEnv: e.target.checked })} /> Drop ANTHROPIC_* variables {cfgSaved}</label> },
    { id: "live-approval", section: "Claude runs", label: "Live tool approval (experimental)", words: "permission approve allow deny prompt tool live stream-json long-lived process control protocol",
      desc: "Keeps one Claude process per chat so that when Claude needs permission for a tool, the chat shows Allow once / Deny buttons and the run continues. Off: a denied tool ends the run and the chat offers “Allow this tool & retry”. Nothing is ever auto-approved and bypassPermissions is never used. An idle process is closed after 10 minutes.",
      body: cfg && <label><input type="checkbox" checked={cfg.liveApproval === true} onChange={(e) => void saveCfg({ ...cfg, liveApproval: e.target.checked })} /> Answer permission questions in the chat {cfgSaved}</label> },
    { id: "opencode-model", section: "OpenCode runs", label: "Default model", words: "opencode model provider providerID ollama local big expensive default --model",
      desc: "Model for messages and new hires in OpenCode, in provider/model form (for example opencode/deepseek-v4.1-flash-free). Leave empty to keep each chat's own model, then OpenCode's default. A project can override this in Projects below.",
      body: cfg && <><input list="settings-oc-models" placeholder="(chat's own model)" value={cfg.opencodeModel} maxLength={100} onChange={(e) => setCfg({ ...cfg, opencodeModel: e.target.value.trim() })} onBlur={() => void saveCfg(cfg)} /> {cfgSaved}</> },
    { id: "claude-test", section: "Claude runs", wide: true, label: "Test run", words: "try check hello works connection setup status",
      desc: "Runs a tiny prompt in your most recent project and shows the answer or the problem, plus which gateway and model the next run uses.",
      body: <ClaudeSetup /> },
    { id: "archive", section: "Archive", wide: true, label: "Archived agents", words: "restore hidden deleted removed sessions file cabinet",
      desc: "Agents you archived leave the office. Nothing is deleted: restore one and it comes back.",
      body: <ArchiveList /> },
    { id: "simchat-enabled", section: "Water cooler chat", label: "Simulated chat", words: "water cooler chat bot talk offline fake idle rate limited banter jokes",
      desc: "Chat with a simulated, offline version of an agent from the agent menu. No model is called and nothing leaves your machine.",
      body: <label><input type="checkbox" checked={getSimChat().enabled} onChange={(e) => { setSimChat({ enabled: e.target.checked }); bump((n) => n + 1); }} /> Enabled</label> },
    { id: "simchat-idle", section: "Water cooler chat", label: "Idle agents start chats", words: "idle initiate greet unread dot rate limit spontaneous",
      desc: "Idle agents (and, in rate-limit mode, any agent) occasionally start a thread and show an unread dot.",
      body: <label><input type="checkbox" checked={getSimChat().idleStart} onChange={(e) => { setSimChat({ idleStart: e.target.checked }); bump((n) => n + 1); }} /> Allowed</label> },
    { id: "simchat-speed", section: "Water cooler chat", label: "Typing speed", words: "typewriter speed slow fast instant text animation",
      desc: "How fast the simulated agent's text appears.",
      body: <select value={getSimChat().speed} onChange={(e) => { setSimChat({ speed: e.target.value as ChatSpeed }); bump((n) => n + 1); }}>
        <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option></select> },
    { id: "simchat-advance", section: "Water cooler chat", label: "Advance", words: "automatic manual continue next message click pace timing",
      desc: "Automatic: the next message appears about 3 seconds after the last one. Manual: only when you click continue (or press Enter).",
      body: <select value={getSimChat().advance} onChange={(e) => { setSimChat({ advance: e.target.value as ChatAdvance }); bump((n) => n + 1); }}>
        <option value="auto">Automatic</option><option value="manual">Manual</option></select> },
    { id: "simchat-filter", section: "Water cooler chat", label: "Content filter", words: "family friendly pg13 mature content rating clean jokes",
      desc: "Family: only G and PG topics. PG-13: also lightly edgier banter (still no slurs or sexual content).",
      body: <select value={getSimChat().filter} onChange={(e) => { setSimChat({ filter: e.target.value as ChatFilter }); bump((n) => n + 1); }}>
        <option value="family">Family</option><option value="pg13">PG-13</option></select> },
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
    { id: "teams", section: "Projects", wide: true, label: "Project teams, permissions, hires and tools", words: "merge directories globs allowedTools permissionMode acceptEdits plan bypass color team override name hire cwd working directory model agent opencode codex",
      desc: "Merge directories into one team with globs, give a team a color, and set which tools and permission mode runs in it use. A project can also save the working directory, agent and model used when you hire someone here. Bypass is never offered.",
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
              <input placeholder="Hire working directory (absolute path; empty = newest session)" value={r.cwd} maxLength={1024} onChange={(e) => patch(i, { cwd: e.target.value })} />
            </p>
            <p>
              <select aria-label="Hire agent" value={r.source} onChange={(e) => patch(i, { source: e.target.value })}>
                <option value="">Claude (default)</option><option value="claude">Claude Code</option><option value="opencode">OpenCode</option>
              </select>{" "}
              <input list="settings-oc-models" placeholder="Hire model (provider/model)" value={r.model} maxLength={100} onChange={(e) => patch(i, { model: e.target.value.trim() })} />
            </p>
            <p>
              <input placeholder="allowedTools (comma list)" value={r.tools} onChange={(e) => patch(i, { tools: e.target.value })} />{" "}
              <select aria-label="Permission mode" value={r.mode} onChange={(e) => patch(i, { mode: e.target.value })}>
                {MODES.map((m) => <option key={m} value={m}>{m || "(user default)"}</option>)}
              </select>
            </p>
            <HireBox team={r.name} cwd={r.cwd} source={r.source} model={r.model} />
          </div>
        ))}
        <button onClick={() => setRows([...rows, { name: "", globs: "", color: "", cwd: "", source: "", model: "", tools: "", mode: "" }])}>Add team</button>{" "}
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
    <section className={`settings ${compact ? "compact" : ""}`} ref={wrap}>
      <datalist id="settings-oc-models">{ocModels.map((m) => <option key={m.id} value={m.id} label={`${m.name} · ${m.provider}`} />)}</datalist>
      <aside className="settings-nav">
        <h1>Settings</h1>
        <input type="search" placeholder="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} />
        {compact && (
          <select aria-label="Section" value={active} onChange={(e) => pick(e.target.value)}>
            {["All", ...all].map((sec) => <option key={sec} value={sec}>{sec} ({sec === "All" ? found.length : count(sec)})</option>)}
          </select>
        )}
        <nav role="tablist" aria-label="Setting sections" style={compact ? { display: "none" } : undefined}>
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
        {sections.map((sec) => {
          const secOpts = shown.filter((o) => o.section === sec);
          const allForm = secOpts.length > 0 && secOpts.every((o) => o.form);
          return (
            <div key={sec} className="settings-group">
              <h2>{sec}</h2>
              <div className={`settings-card ${allForm ? "form-card" : ""}`}>
                {secOpts.map((o) => (o.form ? <FormField key={o.id} o={o} /> : <Field key={o.id} o={o} />))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
