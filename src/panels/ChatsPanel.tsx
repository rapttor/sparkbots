import { useState } from "react";
import { useStore } from "../state/store";
import { applyFilters } from "./teamFilters";
import { BotIcon } from "./BotIcon";
import { StateBadge } from "./Badge";
import { Icon } from "../dock/icons";
import { chatTab } from "../state/dock";
import { displayName, relTime } from "../util";

const ORDER: Record<string, number> = { waiting: 0, working: 1, error: 2, done: 3, idle: 4, asleep: 5 };

/** Open chats (one tab each) and a way to start a new one with any agent. */
export function ChatsPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const dock = useStore((s) => s.dock);
  const filters = useStore((s) => s.filters);
  const tasks = useStore((s) => s.tasks);
  const seen = useStore((s) => s.seen);
  const selectWorker = useStore((s) => s.selectWorker);
  const activate = useStore((s) => s.activateTab);
  const closeTab = useStore((s) => s.closeTab);
  const [q, setQ] = useState("");
  if (!snapshot) return <section className="panel"><p className="muted">Loading…</p></section>;
  const all = applyFilters(snapshot.teams, filters, tasks).flatMap((t) => t.workers);
  const byId = new Map(snapshot.teams.flatMap((t) => t.workers).map((w) => [w.id, w]));
  const open = dock.chats.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => !!w);
  const term = q.trim().toLowerCase();
  const list = all
    .filter((w) => !term || `${displayName(w)} ${w.title} ${w.team}`.toLowerCase().includes(term))
    .sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) || b.lastEventAt - a.lastEventAt)
    .slice(0, 60);
  return (
    <section className="panel">
      <h1>Chats</h1>
      <h2>Open ({open.length})</h2>
      {open.length === 0 && <p className="muted small">No chat is open. Click an agent in the 3D office or pick one below.</p>}
      <div className="cards">
        {open.map((w) => {
          const unseen = !!w.said && w.said.at > (seen[w.id] ?? 0);
          return (
            <div className={`card chat-row ${dock.active === chatTab(w.id) ? "card-on" : ""}`} key={w.id} onClick={() => activate(chatTab(w.id))}>
              <div className="card-top">
                <span className="proj-name"><BotIcon color={w.color} size={20} title="" onPick={() => {}} /><strong title={w.title}>{displayName(w)}</strong>{unseen && <i className="dot s-waiting" title="New message" />}</span>
                <button className="icon-btn" aria-label="Close chat" onClick={(e) => { e.stopPropagation(); closeTab(chatTab(w.id)); }}><Icon name="close" size={13} /></button>
              </div>
              <div className="card-meta small"><StateBadge state={w.state} /><span className="muted">{w.team} · {relTime(w.lastEventAt)}</span></div>
            </div>
          );
        })}
      </div>
      <h2>Start a chat</h2>
      <input className="tb-search" type="search" placeholder="Find an agent…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
      <div className="cards" style={{ marginTop: 8 }}>
        {list.map((w) => (
          <div className="card chat-row" key={w.id} onClick={() => selectWorker(w.id)} title="Open its chat and fly the camera to it">
            <div className="card-top"><span className="proj-name"><BotIcon color={w.color} size={18} title="" onPick={() => {}} /><strong title={w.title}>{displayName(w)}</strong></span><StateBadge state={w.state} /></div>
            <div className="muted small">{w.team} · {relTime(w.lastEventAt)}</div>
          </div>
        ))}
        {list.length === 0 && <p className="muted small">No agent matches.</p>}
      </div>
    </section>
  );
}
