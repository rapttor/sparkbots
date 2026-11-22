import { useEffect, useState, useSyncExternalStore } from "react";
import { call } from "../../api";
import { hub, setAuto } from "./instance";
import { GAMES, GAME_IDS } from "./registry";
import type { GameId, RankRow } from "./types";
import { goTo, spotBehindTable } from "./goto";
import { RaceSetup } from "./race/RaceSetup";
import { useSwallowEvents } from "./swallow";

const CSS = `
.games-bar{position:absolute;z-index:6;top:46px;left:0;right:0;padding:0 15%;display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;pointer-events:none}
.games-bar>*{pointer-events:auto}
.games-chip{display:flex;gap:6px;align-items:center;padding:3px 8px;background:#151b27ee;border:1px solid #3a4558;border-radius:999px;font-size:12px;color:#e7ecf5}
.games-chip button{border:0;background:#0000;color:#e7ecf5;cursor:pointer;padding:0 2px;font-size:12px}
.games-chip select{font-size:11px;max-width:120px}
.games-pop{position:absolute;z-index:7;top:44px;left:50%;transform:translateX(-50%);width:min(440px,92vw);max-height:70vh;overflow:auto;padding:10px;background:#151b27;border:1px solid #3a4558;border-radius:8px;box-shadow:0 8px 24px #0009;color:#e7ecf5;font-size:12px;pointer-events:auto}
.games-pop table{width:100%;border-collapse:collapse}.games-pop th,.games-pop td{padding:2px 6px;text-align:right}.games-pop th:first-child,.games-pop td:first-child{text-align:left}
.games-pop .tabs{display:flex;gap:4px;margin:6px 0;flex-wrap:wrap}.games-pop .tabs button.on{outline:1px solid #4fd1c5}
.games-pop form{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
.game-score{padding:3px 8px;background:#10151fdd;border:1px solid #3a4558;border-radius:6px;color:#e7ecf5;font-size:12px;white-space:nowrap;text-align:center}
.game-score-detail{font-size:15px}.game-score-status{color:#ffd166}
`;

/** Header chips (one per running game, ✕ to exit it) and the 🎮 popover: rankings, start/invite, and the "idle agents play" switch. */
export function GamesOverlay({ nameOf }: { nameOf: (id: string | null) => string }) {
  useSyncExternalStore((cb) => hub.subscribe(cb), () => hub.version);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"rank" | "new">("rank");
  const popRef = useSwallowEvents(); // clicks inside the popover never reach the 3D scene behind it
  const [tab, setTab] = useState<GameId | "all">("all");
  const [rows, setRows] = useState<RankRow[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<{ game: GameId | "race"; a: string; b: string }>({ game: "pong", a: "", b: "" });
  const cand = open || hub.instances.some((i) => !i.seats[1].agent) ? hub.candidates() : [];

  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => { void call<{ rankings: RankRow[] }>("GET", `/api/games/rankings${tab === "all" ? "" : `?game=${tab}`}`).then((r) => setRows(r.rankings)).catch(() => setRows([])); }, 300);
    return () => clearTimeout(h);
  }, [open, tab, hub.version]);

  const start = () => {
    if (form.game === "race") return;
    const ids = [form.a || cand[0], form.b].filter((x): x is string => !!x);
    if (!ids.length) { setMsg("No idle agent is free right now."); return; }
    const inst = hub.open(form.game, ids, true);
    setMsg(inst ? "" : "No free table for that game (or an agent is busy).");
    if (inst) { const p = spotBehindTable(inst.slot); goTo(p.x, p.z); setOpen(false); } // you start a game: go and watch it from beside the table
  };
  const options = (skip = "") => cand.filter((c) => c !== skip).map((c) => <option key={c} value={c}>{hub.nameOf(c)}</option>);

  return (
    <>
      <style>{CSS}</style>
      <div className="games-bar">
        <button className="games-chip" title="Game room: rankings, start a game" onClick={() => setOpen(!open)}>🎮 Games{hub.instances.length ? ` · ${hub.instances.length}` : ""}</button>
        {hub.instances.map((i) => (
          <span className="games-chip" key={i.id}>
            {GAMES[i.game].icon} {nameOf(i.seats[0].agent)} {i.sim ? i.line : "vs"} {i.seats[1].agent ? nameOf(i.seats[1].agent) : (
              <select aria-label="Invite an agent" value="" onChange={(e) => { if (e.target.value) hub.invite(i.id, e.target.value); }}>
                <option value="">invite…</option>{options(i.seats[0].agent ?? "")}
              </select>
            )}
            <button title="Go to this table" aria-label="Go to this table" onClick={() => { const p = spotBehindTable(i.slot); goTo(p.x, p.z); }}>📍</button>
            <button title="Stop this game" aria-label="Stop this game" onClick={() => hub.stop(i.id)}>✕</button>
          </span>
        ))}
      </div>
      {open && (
        <div className="games-pop" role="dialog" aria-label="Game room" ref={popRef}>
          <div className="tabs pages" role="tablist" aria-label="Game room">
            <button role="tab" aria-selected={page === "rank"} className={page === "rank" ? "on" : ""} onClick={() => setPage("rank")}>🏆 Rankings</button>
            <button role="tab" aria-selected={page === "new"} className={page === "new" ? "on" : ""} onClick={() => setPage("new")}>🎮 New game</button>
            <span style={{ flex: 1 }} /><button aria-label="Close" onClick={() => setOpen(false)}>×</button>
          </div>
          {page === "rank" && <>
          <div className="tabs">
            {(["all", ...GAME_IDS] as const).map((g) => <button key={g} className={tab === g ? "on" : ""} onClick={() => setTab(g)}>{g === "all" ? "All" : `${GAMES[g].icon} ${GAMES[g].name}`}</button>)}
          </div>
          {rows.length === 0 ? <p className="muted">No finished matches yet.</p> : (
            <table>
              <thead><tr><th>Agent</th><th>Won</th><th>Lost</th><th>Played</th><th>Win %</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.agent}><td>{r.name}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.plays}</td><td>{r.plays ? Math.round((r.wins / r.plays) * 100) : 0}%</td></tr>)}</tbody>
            </table>
          )}
          </>}
          {page === "new" && <>
          <form onSubmit={(e) => { e.preventDefault(); start(); }}>
            <select aria-label="Game" value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value as GameId | "race" })}>{GAME_IDS.map((g) => <option key={g} value={g} disabled={!hub.canOpen(g)}>{GAMES[g].icon} {GAMES[g].name}</option>)}<option value="race">🏎 Race</option></select>
            {form.game !== "race" && <>
            <select aria-label="Player one" value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })}><option value="">first idle agent</option>{options(form.b)}</select>
            <select aria-label="Player two" value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })}><option value="">opponent: invite later</option>{options(form.a)}</select>
            <button type="submit">Start</button>
            {hub.instances.length > 0 && <button type="button" onClick={() => hub.stopAll()}>Stop all</button>}
            </>}
          </form>
          {form.game === "race" && <RaceSetup onStarted={() => setOpen(false)} />}
          {msg && <p role="alert">{msg}</p>}
          {form.game !== "race" && <label><input type="checkbox" checked={hub.auto} onChange={(e) => { setAuto(e.target.checked); setMsg(""); }} /> Idle agents play on their own</label>}
          </>}
          <p className="muted">Games are for show: they never stop an agent from working, and nothing leaves your machine.</p>
        </div>
      )}
    </>
  );
}
