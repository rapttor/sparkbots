import { useEffect, useRef, useState } from "react";
import type { Worker, WorkerState } from "../../server/adapters/types";
import { api, type Card, type RunRecord } from "../api";
import { useLive } from "../state/live";
import { useStore } from "../state/store";
import { StateBadge } from "../panels/Badge";
import { BotIcon } from "../panels/BotIcon";
import { fmtDuration, fmtNum, relTime, displayName } from "../util";
import { ACTIONS } from "./actions";
import { poiChoices } from "./roam";
import { requestCoffee } from "./servicebots";

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

/** Centered dialog that opens when you click an agent: talk, actions, show-as (visual only), and quick actions. */
export function AgentMenu({ worker: w, scene, onClose }: { worker: Worker; scene: SceneApi; onClose: () => void }) {
  const openChat = useStore((s) => s.openChat);
  const followers = useStore((s) => s.followers);
  const toggleFollower = useStore((s) => s.toggleFollower);
  const [open, setOpen] = useState<"" | "perform" | "look" | "idle" | "go" | "cards">("perform") // the Perform (actions) section starts expanded;
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => { if (open === "cards") api.board().then((c) => setCards(c.filter((x) => x.team === w.team && (x.column === "backlog" || x.column === "ready")))).catch(() => {}); }, [open, w.team]);
  const [detail, setDetail] = useState(false);
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
      <div className="agent-menu agent-dialog" ref={ref} role="dialog" aria-modal="true" aria-label={`Actions for ${displayName(w)}`} onWheel={(e) => e.stopPropagation()}>
      <header className="am-head">
        <BotIcon color={w.color} size={22} title="Robot color: click to choose (recolors this agent in the 3D office)" onPick={(c) => { void api.setBotColor(w.id, c).catch((e: Error) => setNote(e.message)); }} />
        <strong title={w.title}>{displayName(w)}</strong>
        <span className="muted small" title="Project / team">{w.team}</span>
        <StateBadge state={w.state} />
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </header>
      {item("💬 Talk", () => { openChat(w.id); onClose(); }, "E")}
      {item("☕ Bring a coffee", () => { requestCoffee(w.id); onClose(); })}
      {item(followers.includes(w.id) ? "👥 Stop following" : "👥 Follow me", () => { toggleFollower(w.id); onClose(); }, "F")}
      {ACTIONS.filter((a) => a.kind === "real").map((a) => item(`${a.label} …`, () => { scene.act(a.key, w.id); onClose(); }, a.key.toUpperCase(), a.can?.(w) ?? undefined))}
      {item(`🎬 Perform ${open === "perform" ? "▾" : "▸"}`, () => setOpen(open === "perform" ? "" : "perform"))}
      {open === "perform" && <div className="am-sub">
        <p className="muted small">Cosmetic animations only; the real status does not change.</p>
        {ACTIONS.filter((a) => a.kind === "fx" && a.key !== "f").map((a) => item(a.label, () => { scene.act(a.key, w.id); onClose(); }))}
      </div>}
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
      </div>
    </div>
  );
}
