import { useState } from "react";
import type { Worker } from "../../server/adapters/types";
import { api, type RunRecord } from "../api";
import { useLive } from "../state/live";
import { useStore } from "../state/store";
import { lunchAll, wakeAll } from "./roam";
import { sendView } from "./viewBus";

const CONTINUE = "Please continue where you left off.";
export const MAX_GROUP = 12; // at most this many agents per group action

/**
 * Group actions for one project's agents (used in the 3D title menu and in the Projects panel): continue all, pause all,
 * rally the waiting, meeting, wake the sleepers, lunch. Anything that sends a message asks for confirmation first.
 */
export function ProjectActions({ name, workers, onDone }: { name: string; workers: Worker[]; onDone?: () => void }) {
  const setFollowers = useStore((s) => s.setFollowers);
  const setMeetingOpen = useStore((s) => s.setMeetingOpen);
  const [note, setNote] = useState("");
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useLive(async () => { try { setRuns(await api.runs()); } catch { /* ignore */ } }, ["runs"]);

  const ids = new Set(workers.map((w) => w.id));
  const idle = workers.filter((w) => w.state !== "working" && w.state !== "waiting");
  const sendable = idle.filter((w) => !w.liveInTerminal).slice(0, MAX_GROUP);
  const skipped = workers.length - sendable.length;
  const running = runs.filter((r) => r.status === "running" && r.session && ids.has(r.session));
  const waiting = workers.filter((w) => w.state === "waiting");
  const asleep = workers.filter((w) => w.state === "asleep");
  const wrap = async (fn: () => Promise<unknown>, ok: string) => { setNote(""); try { await fn(); setNote(ok); } catch (e) { setNote((e as Error).message); } };

  const continueAll = () => {
    if (!window.confirm(`Send this to ${sendable.length} agent${sendable.length === 1 ? "" : "s"} in "${name}"?\n\n${CONTINUE}\n\n${skipped} skipped (already working, waiting for you, open in a terminal, or over the limit of ${MAX_GROUP}).\nEach one runs it as its own message, which uses tokens.`)) return;
    void wrap(async () => { await Promise.all(sendable.map((w) => api.send(w.id, CONTINUE))); }, `Sent to ${sendable.length}`);
  };
  const pauseAll = () => {
    if (!window.confirm(`Stop ${running.length} run${running.length === 1 ? "" : "s"} started from SparkBots in "${name}"?\n\nSessions you run in a terminal are never touched.`)) return;
    void wrap(async () => { await Promise.all(running.map((r) => api.stop(r.runId))); }, `Stopped ${running.length}`);
  };
  const item = (label: string, onClick: () => void, disabled?: string) => (
    <button className="am-item" disabled={!!disabled} title={disabled} onClick={onClick}>{label}</button>
  );
  return (
    <>
      {item(`▶ Continue all (${sendable.length})`, continueAll, sendable.length ? undefined : "Nobody can be sent a message right now")}
      {item(`⏸ Pause all (${running.length})`, pauseAll, running.length ? undefined : "No run started from SparkBots is going")}
      {item(`Rally the waiting (${waiting.length})`, () => { setFollowers(waiting.map((w) => w.id)); sendView({ t: "animate", ids: waiting.map((w) => w.id) }); onDone?.(); }, waiting.length ? undefined : "Nobody is waiting for you")}
      {item(`Meeting with this project (${Math.min(workers.length, MAX_GROUP)})`, () => { const g = workers.slice(0, MAX_GROUP).map((w) => w.id); setFollowers(g); sendView({ t: "animate", ids: g }); setMeetingOpen(true); onDone?.(); }, workers.length ? undefined : "No agents")}
      {item(`Boss is coming: wake a few (${asleep.length})`, () => { const pool = [...asleep]; for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j]!, pool[k]!]; } const ids2 = pool.slice(0, 2 + Math.floor(Math.random() * 4)).map((w) => w.id); wakeAll(ids2); sendView({ t: "animate", ids: ids2 }); onDone?.(); }, asleep.length ? undefined : "Nobody is asleep")}
      {item("Lunch for the idle", () => { const l = workers.filter((w) => w.state === "idle").map((w) => w.id); lunchAll(l); sendView({ t: "animate", ids: l }); onDone?.(); })}
      {note && <p className="small am-note">{note}</p>}
    </>
  );
}
