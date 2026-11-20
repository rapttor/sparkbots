import { displayName } from "../util";
import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { StateBadge } from "./Badge";
import { api, poll, type RunRecord, type StreamLine } from "../api";

function assistantText(lines: StreamLine[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (l.type === "assistant") { for (const b of l.message?.content ?? []) if (b.type === "text" && b.text) out.push(b.text); }
    else if (l.type === "result" && l.result) out.push(l.result);
  }
  return out;
}

export function WorkerPanel() {
  const { snapshot, selectedWorker, selectWorker } = useStore();
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [fresh, setFresh] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [run, setRun] = useState<RunRecord | undefined>();
  const [lines, setLines] = useState<StreamLine[]>([]);
  const w = snapshot?.teams.flatMap((t) => t.workers).find((x) => x.id === selectedWorker);
  const wid = w?.id;

  useEffect(() => {
    if (!wid) return;
    setRun(undefined); setLines([]); setNote(""); setErr("");
    return poll(async () => {
      try {
        const runs = await api.runs();
        const mine = runs.filter((r) => r.session === wid).sort((a, b) => b.startedAt - a.startedAt)[0];
        setRun(mine);
        setLines(mine ? await api.runLog(mine.runId) : []);
      } catch { /* transient */ }
    }, 1500);
  }, [wid]);

  if (!w) return null;
  const cmd = `cd ${w.cwd} && claude --resume ${w.id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const guard = async (fn: () => Promise<void>) => { setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); } };
  const send = (fork: boolean, text: string) => guard(async () => {
    const r = await api.send(w.id, text, fork);
    setNote(r.queued ? `Queued (position ${r.position})` : fork ? "Forked to new worker" : "Sent");
    if (!fork) setPrompt("");
  });
  const spawn = () => guard(async () => { await api.spawn(w.cwd, fresh); setFresh(""); setNote("New worker started"); });
  const texts = assistantText(lines);

  return (
    <aside className="worker-panel">
      <button className="icon-btn close" aria-label="Close" onClick={() => selectWorker(undefined)}>×</button>
      <h2>{displayName(w)}</h2>
      {w.name && <p className="muted small">Session: {w.title}</p>}
      <dl>
        <dt>State</dt><dd><StateBadge state={w.state} /></dd>
        <dt>Activity</dt><dd>{w.activity}</dd>
        <dt>Team</dt><dd>{w.team}</dd>
        <dt>Directory</dt><dd className="mono">{w.cwd}</dd>
      </dl>
      {w.preview && <blockquote className="preview">{w.preview}</blockquote>}
      {w.liveInTerminal && (
        <div className="tag">
          Live in terminal
          <div><button onClick={() => send(true, prompt || "Continue")}>Fork to new worker</button></div>
        </div>
      )}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={w.liveInTerminal}
        placeholder={w.liveInTerminal ? "Live in terminal" : "Message this worker"}
        aria-label="Message"
      />
      <button disabled={w.liveInTerminal || !prompt.trim()} onClick={() => send(false, prompt)}>Send</button>
      {note && <p className="muted small">{note}</p>}
      {err && <p className="small" role="alert" style={{ color: "#c33" }}>{err}</p>}
      {run && (
        <div className="run">
          <p className="small">
            Run: <strong>{run.status}</strong>{(run.status === "running" || run.status === "orphaned") && ` (pid ${run.pid})`}
            {run.status === "running" && <> <button onClick={() => guard(() => api.stop(run.runId).then(() => undefined))}>Stop</button></>}
          </p>
          {texts.map((t, i) => <p key={i} className="preview" style={{ whiteSpace: "pre-wrap" }}>{t}</p>)}
        </div>
      )}
      <button onClick={copy}>{copied ? "Copied" : "Copy terminal command"}</button>
      <hr />
      <h3>New worker here</h3>
      <textarea value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="Prompt for a new worker in this directory" aria-label="New worker prompt" />
      <button disabled={!fresh.trim()} onClick={spawn}>Spawn</button>
    </aside>
  );
}
