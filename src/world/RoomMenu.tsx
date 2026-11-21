import { useEffect, useRef, useState } from "react";
import type { Worker } from "../../server/adapters/types";
import { api, type RunRecord } from "../api";
import { useLive } from "../state/live";
import { useStore } from "../state/store";
import { fmtDuration, fmtNum } from "../util";
import type { SceneApi } from "./AgentMenu";
import type { LabelItem } from "./labels";
import { ProjectActions } from "./ProjectActions";
import { MANAGER_ID, requestCoffee } from "./servicebots";

const CONTINUE = "Please continue where you left off.";
const MAX = 12; // at most this many agents per group action

/** Popup for a floating title: a project (continue all, pause all, status, ...) or a room (send idle agents here, who is here). */
export function RoomMenu({ item, workers, everyone, x, y, scene, onGo, onClose }: {
  item: LabelItem; workers: Worker[]; everyone: Worker[]; x: number; y: number; scene: SceneApi; onGo: () => void; onClose: () => void;
}) {
  const setFollowers = useStore((s) => s.setFollowers);
  const setMeetingOpen = useStore((s) => s.setMeetingOpen);
  const followers = useStore((s) => s.followers);
  const clearFollowers = useStore((s) => s.clearFollowers);
  const [info, setInfo] = useState(false);
  const [note, setNote] = useState("");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useLive(async () => { try { setRuns(await api.runs()); } catch { /* ignore */ } }, ["runs"]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);

  const project = item.kind === "project";
  const ids = new Set(workers.map((w) => w.id));
  const idle = workers.filter((w) => w.state !== "working" && w.state !== "waiting");
  const sendable = idle.filter((w) => !w.liveInTerminal).slice(0, MAX);
  const skipped = workers.length - sendable.length;
  const running = runs.filter((r) => r.status === "running" && r.session && ids.has(r.session));
  const waiting = workers.filter((w) => w.state === "waiting");
  const asleep = workers.filter((w) => w.state === "asleep");
  const wrap = async (fn: () => Promise<unknown>, ok: string) => { setNote(""); try { await fn(); setNote(ok); } catch (e) { setNote((e as Error).message); } };

  const continueAll = () => {
    if (!window.confirm(`Send this to ${sendable.length} agent${sendable.length === 1 ? "" : "s"} in "${item.name}"?\n\n${CONTINUE}\n\n${skipped} skipped (already working, waiting for you, open in a terminal, or over the limit of ${MAX}).\nEach one runs it as its own message, which uses tokens.`)) return;
    void wrap(async () => { await Promise.all(sendable.map((w) => api.send(w.id, CONTINUE))); }, `Sent to ${sendable.length}`);
  };
  const pauseAll = () => {
    if (!window.confirm(`Stop ${running.length} run${running.length === 1 ? "" : "s"} started from SparkBots in "${item.name}"?\n\nSessions you run in a terminal are never touched.`)) return;
    void wrap(async () => { await Promise.all(running.map((r) => api.stop(r.runId))); }, `Stopped ${running.length}`);
  };
  const item2 = (label: string, onClick: () => void, disabled?: string) => (
    <button className="am-item" disabled={!!disabled} title={disabled} onClick={onClick}>{label}</button>
  );

  // totals for the status card
  const t = workers.reduce((a, w) => ({ tokens: a.tokens + (w.stats?.tokens ?? 0), work: a.work + (w.stats?.workMs ?? 0), turns: a.turns + (w.stats?.turns ?? 0) }), { tokens: 0, work: 0, turns: 0 });
  const counts = workers.reduce<Record<string, number>>((a, w) => { a[w.state] = (a[w.state] ?? 0) + 1; return a; }, {});
  const here = everyone.filter((w) => w.id).length;

  return (
    <div className="agent-menu" ref={ref} style={{ left: x, top: y }} onWheel={(e) => e.stopPropagation()}>
      <header className="am-head"><strong>{item.name}</strong><span className="muted small">{project ? `${workers.length} agents` : "room"}</span><button className="icon-btn" aria-label="Close" onClick={onClose}>×</button></header>
      {item2("📍 Go there", () => { onGo(); onClose(); })}
      {followers.length > 0 && item2(`🚪 Release the meeting (${followers.length})`, () => { clearFollowers(); onClose(); })}
      {project && <ProjectActions name={item.name} workers={workers} onDone={onClose} />}
      {!project && item.poiId && item2(`📍 Send idle agents here`, () => {
        const go = everyone.filter((w) => w.state === "idle" || w.state === "asleep").slice(0, MAX);
        if (!window.confirm(`Send ${go.length} idle agent${go.length === 1 ? "" : "s"} to "${item.name}" for a minute? (visual only)`)) return;
        go.forEach((w) => scene.sendTo(w.id, item.poiId!)); onClose();
      })}
      {item.id === "z:coffee-station" && item2("☕ Order a coffee", () => { requestCoffee(MANAGER_ID); onClose(); })}
      {item2(`ⓘ ${project ? "Status" : "Who is here"}`, () => setInfo(!info))}
      {note && <p className="small am-note">{note}</p>}
      {info && project && (
        <div className="am-detail">
          <div className="am-grid">
            {Object.entries(counts).map(([s, n]) => <span key={s} style={{ display: "contents" }}><span>{s}</span><b>{n}</b></span>)}
            <span>Worked</span><b>{fmtDuration(t.work)}</b>
            <span>Tokens</span><b>{fmtNum(t.tokens)}</b>
            <span>Prompts</span><b>{fmtNum(t.turns)}</b>
          </div>
          <button className="small" style={{ marginTop: 6 }} onClick={() => { useStore.getState().setPanel("teams"); useStore.getState().focusTeam(item.name); onClose(); }}>Open in Teams</button>
        </div>
      )}
      {info && !project && <div className="am-detail"><p className="small">{here ? "Robots in the room are shown in the 3D view." : "Nobody."}</p></div>}
    </div>
  );
}
