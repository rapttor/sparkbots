import { useEffect, useRef, useState } from "react";
import type { Worker, WorkerState } from "../../server/adapters/types";
import { api, type Card, type ChatMessage, type RunRecord } from "../api";
import { useLive } from "../state/live";
import { useStore } from "../state/store";
import { StateBadge } from "../panels/Badge";
import { BotIcon } from "../panels/BotIcon";
import { ProjectBadge } from "../panels/ProjectBadge";
import { fmtDuration, fmtNum, relTime, displayName } from "../util";
import { ACTIONS } from "./actions";
import { poiChoices } from "./roam";
import { hub as gameHub } from "./games/instance";
import { playChoices, startGame } from "./games/playWhileLimited";
import { rateLimitedAt } from "./rateLimit";
import { requestCoffee } from "./servicebots";
import { SimChatUnread } from "../simchat/SimChat";
import { useSimChat } from "../simchat/store";
import { getSettings } from "../simchat/settings";
import { RewardsSection } from "./rewards/RewardsSection";
import { bumpCaffeine, caffeineBand, caffeineLevel, refreshCaffeine } from "./caffeine";

/** Caffeine meter (cosmetic: wired agents twitch, sleepy ones yawn). A snack bumps it a little. */
function CaffeineRow({ id }: { id: string }) {
  const [, tick] = useState(0);
  useEffect(() => { void refreshCaffeine().then(() => tick((n) => n + 1)); }, [id]);
  const v = Math.round(caffeineLevel(id)), b = caffeineBand(id);
  return (
    <div className="am-row small" title="Caffeine level. Coffee and snacks raise it, it fades over hours. Only changes how the robot twitches or yawns.">
      <span>☕ Caffeine</span> <meter min={0} max={100} value={v} style={{ width: 90 }} /> <b>{v}</b> <span className="muted">{b === "wired" ? "wired" : b === "sleepy" ? "sleepy" : "fine"}</span>{" "}
      <button onClick={() => { bumpCaffeine(id, "food"); setTimeout(() => tick((n) => n + 1), 300); }}>🍪 Snack</button>
    </div>
  );
}

/** What the 3D scene offers the menu (cosmetic things happen inside the scene). */
export interface SceneApi {
  talk: () => void;
  act: (key: string, workerId?: string) => void;
  look: (id: string, state: WorkerState | null, sit?: boolean, ms?: number) => void;
  archive: (id: string, done: () => void) => void;
  sendTo: (id: string, poiId: string) => void;
}

const LOOKS: { state: WorkerState; label: string }[] = [
  { state: "working", label: "Working" }, { state: "waiting", label: "Waiting for you" },
  { state: "done", label: "Done (wave)" }, { state: "error", label: "Problem" }, { state: "asleep", label: "Asleep" },
];
const CONTINUE = "Please continue where you left off.";

function Detail({ w }: { w: Worker }) {
  const s = w.stats;
  return (
    <div className="am-detail">
      <div className="am-row"><StateBadge state={w.state} /> <span>{w.activity}</span> <span className="muted small">{relTime(w.lastEventAt)}</span></div>
      {s ? (
        <div className="am-grid">
          <span>Worked</span><b>{fmtDuration(s.workMs)}</b>
          <span>Tokens</span><b>{fmtNum(s.tokens)}</b>
          <span>Prompts</span><b>{fmtNum(s.turns)}</b>
          <span>Tool calls</span><b>{fmtNum(s.tools)}</b>
          <span>Context</span><b>{fmtNum(s.ctx)}</b>
          <span>Helpers</span><b>{w.helpers}</b>
        </div>
      ) : <p className="muted small">Stats are still being counted…</p>}
      {w.liveInTerminal && <p className="small">Live in a terminal: messages go to a fork.</p>}
      {w.said && <blockquote className="am-said">{w.said.text}</blockquote>}
      <p className="muted small mono" title={w.cwd}>{w.cwd}</p>
    </div>
  );
}

/** The agent's messages (read-only, newest at the bottom) with a search box; the chat itself is one click away. */
function AgentHistory({ w, onOpenChat }: { w: Worker; onOpenChat: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { let live = true; api.sessionMessages(w.id).then((r) => { if (live) setMsgs(r.messages); }).catch((e: Error) => { if (live) setErr(e.message); }); return () => { live = false; }; }, [w.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);
  const shown = (msgs ?? []).filter((m) => !q.trim() || m.text.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="am-history">
      <div className="tb-row"><input aria-label="Search this agent's messages" placeholder="Search messages…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} /><button className="small" onClick={onOpenChat}>💬 Open chat</button></div>
      {err && <p role="alert" className="s-error small">{err}</p>}
      {msgs === null && !err && <p className="muted small">Loading…</p>}
      {msgs && shown.length === 0 && <p className="muted small">{q ? "No message matches." : "No messages yet."}</p>}
      <div className="am-history-list">
        {shown.map((m, i) => (
          <div key={i} className={`am-msg ${m.role === "user" ? "mine" : "bot"}`}>
            <span className="muted small">{m.role === "user" ? "You" : displayName(w)}{m.at ? ` · ${relTime(m.at)}` : ""}</span>
            <div>{m.text.length > 1500 ? `${m.text.slice(0, 1500)}…` : m.text}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

/** Centered dialog that opens when you click an agent: talk, actions, show-as (visual only), and quick actions. */
export function AgentMenu({ worker: w, scene, onClose }: { worker: Worker; scene: SceneApi; onClose: () => void }) {
  const openChat = useStore((s) => s.openChat);
  const followers = useStore((s) => s.followers);
  const toggleFollower = useStore((s) => s.toggleFollower);
  const [open, setOpen] = useState<"" | "look" | "idle" | "go" | "cards">("");
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => { if (open === "cards") api.board().then((c) => setCards(c.filter((x) => x.team === w.team && (x.column === "backlog" || x.column === "ready")))).catch(() => {}); }, [open, w.team]);
  const [detail, setDetail] = useState(false);
  const [tab, setTab] = useState<"actions" | "history">("actions");
  const [perfInfo, setPerfInfo] = useState(false);
  const [note, setNote] = useState("");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useLive(async () => { try { setRuns(await api.runs()); } catch { /* ignore */ } }, ["runs"]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the dialog scrolls itself; the page behind stays put
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const running = runs.find((r) => r.session === w.id && r.status === "running");
  const busy = w.state === "working" || w.state === "waiting";
  const whyContinue = w.liveInTerminal ? "Live in a terminal: use Fork in the chat" : busy ? "Already working" : "";
  const wrap = async (fn: () => Promise<unknown>, ok: string) => { setNote(""); try { await fn(); setNote(ok); } catch (e) { setNote((e as Error).message); } };
  const doContinue = () => {
    if (!window.confirm(`Send this to "${displayName(w)}"?\n\n${CONTINUE}`)) return;
    void wrap(() => api.send(w.id, CONTINUE), "Sent");
  };
  const doPause = () => {
    if (!running || !window.confirm(`Stop the run started from SparkBots for "${displayName(w)}"?`)) return;
    void wrap(() => api.stop(running.runId), "Stopped");
  };
  const item = (label: string, onClick: () => void, key?: string, disabled?: string) => (
    <button className="am-item" disabled={!!disabled} title={disabled} onClick={onClick}>{label}{key && <kbd>{key}</kbd>}</button>
  );

  return (
    <div className="agent-dialog-backdrop">
      <div className={`agent-menu agent-dialog ${tab === "history" ? "wide" : ""}`} ref={ref} role="dialog" aria-modal="true" aria-label={`Actions for ${displayName(w)}`} onWheel={(e) => e.stopPropagation()}>
      <header className="am-head">
        <BotIcon color={w.color} size={22} title="Robot color: click to choose (recolors this agent in the 3D office)" onPick={(c) => { void api.setBotColor(w.id, c).catch((e: Error) => setNote(e.message)); }} />
        <strong title={w.title}>{displayName(w)}</strong>
        <ProjectBadge team={w.team} onClick={() => { useStore.getState().focusTeam(w.team); onClose(); }} />
        {w.state !== "asleep" && <button className="small" title="Send home: back to its desk in its project" aria-label="Send home" onClick={() => { scene.look(w.id, "idle", true, 5 * 60_000); onClose(); }}>🏠</button>}
        <StateBadge state={w.state} />
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </header>
      <div className="am-tabs" role="tablist" aria-label="Agent">
        <button role="tab" aria-selected={tab === "actions"} className={tab === "actions" ? "on" : ""} onClick={() => setTab("actions")}>⚡ Actions</button>
        <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>📜 History</button>
      </div>
      {tab === "history" ? <AgentHistory w={w} onOpenChat={() => { openChat(w.id); onClose(); }} /> : <>
      <CaffeineRow id={w.id} />
      <RewardsSection id={w.id} />
      {item("💬 Talk", () => { openChat(w.id); onClose(); }, "E")}
      {getSettings().enabled && <button className="am-item" onClick={() => { useSimChat.getState().open(w.id); useStore.getState().focusAgent(w.id); onClose(); }}><span>🫧 Water cooler chat<SimChatUnread id={w.id} /></span></button>}
      {item("☕ Bring a coffee", () => { requestCoffee(w.id); onClose(); })}
      {item(followers.includes(w.id) ? "👥 Stop following" : "👥 Follow me", () => { toggleFollower(w.id); onClose(); }, "F")}
      {ACTIONS.filter((a) => a.kind === "real").map((a) => item(`${a.label} …`, () => { scene.act(a.key, w.id); onClose(); }, a.key.toUpperCase(), a.can?.(w) ?? undefined))}
      {(() => { // Play while limited (13.4.8): only while the service is rate limited
        const limited = rateLimitedAt(useStore.getState().snapshot?.rateLimitedUntil);
        const picks = playChoices(gameHub, w.id, limited);
        return picks.length > 0 && (
          <div className="am-sub">
            <div className="muted small">⏳ Rate limited, so play:</div>
            {picks.map((c) => item(c.label, () => { if (startGame(gameHub, c.game, w.id)) onClose(); }))}
          </div>
        );
      })()}
      <div className="am-perform">
        <div className="am-perform-title">
          🎬 Perform
          <button type="button" className={`am-info ${perfInfo ? "on" : ""}`} aria-expanded={perfInfo} aria-label="About Perform" title="What is Perform?" onClick={() => setPerfInfo(!perfInfo)}>ⓘ</button>
        </div>
        {perfInfo && <p className="am-perform-help small">Fun animations for this robot, just for show. Nothing is sent to the agent and its real status does not change.</p>}
        <div className="am-tiles">
          {ACTIONS.filter((a) => a.kind === "fx" && a.key !== "f").map((a) => (
            <button key={a.key} className="am-tile" style={{ "--c": a.color ?? "#94a3b8" } as React.CSSProperties} title={a.hint} onClick={() => { scene.act(a.key, w.id); onClose(); }}>
              <span className="am-tile-icon">{a.icon ?? "✨"}</span>
              <b>{a.label}</b>
            </button>
          ))}
        </div>
      </div>
      {w.state !== "asleep" && item("🪑 Call to the desk", () => { scene.look(w.id, "idle", true, 5 * 60_000); onClose(); }, undefined, undefined)}
      {item(`🎭 Show as… ${open === "look" || open === "idle" ? "▾" : "▸"}`, () => setOpen(open === "look" || open === "idle" ? "" : "look"))}
      {(open === "look" || open === "idle") && (
        <div className="am-sub">
          <p className="muted small">Only how the robot acts for 30 s. The real status does not change.</p>
          {item(`Idle ${open === "idle" ? "▾" : "▸"}`, () => setOpen(open === "idle" ? "look" : "idle"))}
          {open === "idle" && <div className="am-sub">
            {item("Wander around", () => { scene.look(w.id, "idle", false); onClose(); })}
            {item("Sit at the desk", () => { scene.look(w.id, "idle", true); onClose(); })}
          </div>}
          {LOOKS.map((l) => item(l.label, () => { scene.look(w.id, l.state); onClose(); }))}
          {item("Back to the real status", () => { scene.look(w.id, null); onClose(); })}
        </div>
      )}
      {item(`📍 Send to… ${open === "go" ? "▾" : "▸"}`, () => setOpen(open === "go" ? "" : "go"))}
      {open === "go" && <div className="am-sub am-scroll">{poiChoices().map((c) => item(c.label, () => { scene.sendTo(w.id, c.id); onClose(); }))}{poiChoices().length === 0 && <p className="muted small">No rooms yet.</p>}</div>}
      {item(`📋 Give a card… ${open === "cards" ? "▾" : "▸"}`, () => setOpen(open === "cards" ? "" : "cards"), undefined, w.source === "opencode" ? "OpenCode card assignment is not wired yet; message the agent instead" : undefined)}
      {open === "cards" && <div className="am-sub am-scroll">
        {cards.length === 0 && <p className="muted small">No Backlog or Ready cards for this project.</p>}
        {cards.slice(0, 12).map((c) => item(c.title.slice(0, 40), () => {
          const fork = w.liveInTerminal;
          if (!window.confirm(`Send the card "${c.title}" to "${displayName(w)}"?${fork ? "\n\nThis agent is open in a terminal: a fork (a new agent) is started instead." : ""}\n\nThe card moves to In progress.`)) return;
          void wrap(() => api.assign(c.id, { session: w.id, fork }), "Card sent");
        }))}
      </div>}
      <div className="am-quick">
        <button disabled={!!whyContinue} title={whyContinue || `Send “${CONTINUE}”`} onClick={doContinue}>▶ Continue</button>
        <button disabled={!running} title={running ? "Stop the run started from SparkBots" : "No run started from SparkBots"} onClick={doPause}>⏸ Pause</button>
        <button className={detail ? "on" : ""} onClick={() => setDetail(!detail)}>ⓘ Status</button>
      </div>
      {note && <p className="small am-note">{note}</p>}
      {detail && <Detail w={w} />}
      </>}
      </div>
    </div>
  );
}
