import { useEffect, useState } from "react";
import { api, type UnitySettings } from "../api";
import { useUnity } from "../unity/store";
import { DEFAULT_RELAY, UNITY_MAX_NAME } from "../shared/unity";

/** Unity: the optional public lobby. Off by default; this panel says exactly what switching it on shares. */
export function UnityPanel() {
  const [s, setS] = useState<UnitySettings | null>(null);
  const [name, setName] = useState("");
  const [relay, setRelay] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inside = useUnity((u) => u.inside);
  const status = useUnity((u) => u.status);
  const note = useUnity((u) => u.note);

  useEffect(() => { void api.unity().then((x) => { setS(x); setName(x.name); setRelay(x.relay); }).catch((e) => setErr((e as Error).message)); }, []);

  const save = async (p: Parameters<typeof api.saveUnity>[0]) => {
    setErr(""); setBusy(true);
    try {
      const x = await api.saveUnity(p);
      setS(x); setName(x.name); setRelay(x.relay);
      if (p.ghost !== undefined) useUnity.getState().setGhost(p.ghost);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!s) return <section className="panel"><h1>Unity</h1>{err ? <p role="alert" style={{ color: "#c33" }}>{err}</p> : <p className="muted">Loading…</p>}</section>;

  return (
    <section className="panel">
      <h1>🌀 Unity</h1>
      <p className="muted">One public lobby for everyone who uses SparkBots. Walk in through the pod in the office, see who is there, and say a few words that appear in a bubble over your head. People who left a little earlier stay behind as ghosts, so you can see someone was there.</p>
      {err && <p role="alert" style={{ color: "#c33" }}>{err}</p>}

      <h2>Switch it on</h2>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={s.enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })} style={{ marginTop: 3 }} />
        <span><b>Join the public Unity lobby.</b> Off by default. While it is off, SparkBots makes no connection to anything.</span>
      </label>

      <div className="card" style={{ margin: "10px 0" }}>
        <b>What switching it on shares</b>
        <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "disc" }}>
          <li>Your <b>display name</b>, the <b>character</b> you set up in Settings (avatar, look and colour), where you stand in Unity and the short messages you type. <b>Everyone in the lobby can see these, and they are strangers.</b></li>
          <li>The relay (a small Cloudflare Worker run by the maker) sees your <b>IP address</b> to limit abuse. It keeps only a short hash of it.</li>
          <li>A <b>ghost</b> (name, character, last place, the goodbye message you choose to leave, and the time) is stored on the relay for up to 7 days (2 days if you just closed the window) or until you come back. You can turn ghosts off below.</li>
          <li><b>Never shared:</b> your agents, projects, folders, prompts, transcripts or anything from <code>~/.claude</code>.</li>
          <li>You can <b>mute</b> anyone and <b>report</b> them from the Unity screen. Messages are plain text, at most 80 characters, and links are dropped.</li>
          <li>Your identity is a random secret kept in <code>~/.agent-office/unity.json</code>. Delete the file to become someone new.</li>
        </ul>
      </div>

      <h2>You in Unity</h2>
      <div className="opt"><div className="opt-text"><div className="opt-label">Display name</div><div className="muted small">Up to {UNITY_MAX_NAME} characters. Empty means "Guest". Names that look like staff (admin, sparkbots, rapttor ...) or contain links become Guest.</div></div>
        <div className="opt-body">
          <input value={name} maxLength={UNITY_MAX_NAME} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== s.name) void save({ name }); }} placeholder="Guest" aria-label="Display name" />
        </div>
      </div>
      <div className="opt"><div className="opt-text"><div className="opt-label">Leave a ghost when I go</div><div className="muted small">Leave through the phone booth and others see a faint figure of you (with your message, if you leave one). Close the window instead and you leave a broken figure with no message. It disappears as soon as you come back.</div></div>
        <div className="opt-body"><input type="checkbox" checked={s.ghost} disabled={busy} onChange={(e) => void save({ ghost: e.target.checked })} aria-label="Leave a ghost" /></div>
      </div>
      <p className="muted small">You appear as the character from Settings (avatar, look and colour), walking, never as the hand.</p>

      <h2>Go in</h2>
      <p>
        <button disabled={!s.enabled || inside} onClick={() => void useUnity.getState().enter()}>{inside ? "You are in Unity" : "Enter Unity"}</button>{" "}
        {inside && <button onClick={() => useUnity.getState().leave()}>Leave</button>}{" "}
        <span className="muted small">{!s.enabled ? "Switch it on first." : inside ? (status === "online" ? "Connected." : note) : note}</span>
      </p>

      <details style={{ marginTop: 14 }}>
        <summary>Advanced: relay address</summary>
        <p className="muted small">Only change this to use your own relay (see <code>relay/</code> in the repository). It must be a <code>wss://</code> address.</p>
        <input style={{ width: "100%" }} value={relay} onChange={(e) => setRelay(e.target.value)} aria-label="Relay address" />
        <p>
          <button disabled={busy || relay === s.relay} onClick={() => void save({ relay })}>Save</button>{" "}
          <button disabled={busy || s.relay === DEFAULT_RELAY} onClick={() => void save({ relay: DEFAULT_RELAY })}>Use the default</button>
        </p>
      </details>
    </section>
  );
}
