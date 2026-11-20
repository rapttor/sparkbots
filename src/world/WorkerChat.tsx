import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { StateBadge } from "../panels/Badge";
import { BotIcon } from "../panels/BotIcon";
import { api, type ChatMessage, type RunRecord } from "../api";
import { useLive } from "../state/live";
import { runProblem, type RunProblem } from "./runStatus";

const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

function Bubble({ m, color }: { m: ChatMessage; color: string }) {
  const mine = m.role === "user";
  return (
    <div className={`wc-row ${mine ? "wc-user" : "wc-bot"}`}>
      {!mine && <span className="wc-avatar"><BotIcon color={color} onPick={() => {}} size={22} title="" /></span>}
      <div className="wc-bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
    </div>
  );
}

export type ChatDock = "float" | "left" | "right";

export function WorkerChat({ workerId, onClose, dock = "float", onDock }: { workerId: string; onClose: () => void; dock?: ChatDock; onDock?: (d: ChatDock) => void }) {
  const snapshot = useStore((s) => s.snapshot);
  const w = snapshot?.teams.flatMap((t) => t.workers).find((x) => x.id === workerId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [run, setRun] = useState<RunRecord | undefined>();
  const [prompt, setPrompt] = useState("");
  const [fresh, setFresh] = useState("");
  const [showFresh, setShowFresh] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [wantFork, setWantFork] = useState(false);
  // model for the next message; remembered per agent in this browser ("" = Claude Code's default)
  const [model, setModelState] = useState(() => { try { return localStorage.getItem(`ao.model.${workerId}`) ?? ""; } catch { return ""; } });
  const setModel = (m: string) => { setModelState(m); try { localStorage.setItem(`ao.model.${workerId}`, m); } catch { /* private mode */ } };
  useEffect(() => { try { setModelState(localStorage.getItem(`ao.model.${workerId}`) ?? ""); } catch { setModelState(""); } }, [workerId]);
  const [problem, setProblem] = useState<RunProblem | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]); setRun(undefined); setNote(""); setErr("");
  }, [workerId]);
  useLive(async () => {
    try {
      const [m, runs] = await Promise.all([api.sessionMessages(workerId), api.runs()]);
      setMessages(m.messages);
      const mine = runs.filter((r) => r.session === workerId).sort((a, b) => b.startedAt - a.startedAt)[0];
      setRun(mine);
      setProblem(mine ? runProblem(await api.runLog(mine.runId).catch(() => [])) : null);
    } catch { /* transient */ }
  }, ["messages", "runs"], workerId);

  const busy = w?.state === "working" || w?.state === "waiting";
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!w) return null;
  const cmd = `cd ${w.cwd} && claude --resume ${w.id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const saveName = (v: string) => {
    setRenaming(false);
    const next = v.trim();
    if (next !== (w.name ?? "")) void api.setBotName(w.id, next || null).catch((e) => setErr((e as Error).message));
  };
  const guard = async (fn: () => Promise<void>) => { setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); } };
  const send = (fork: boolean, text: string) => guard(async () => {
    const r = await api.send(w.id, text, fork, model || undefined);
    setNote(r.queued ? `Queued (position ${r.position})` : fork ? "Forked to new worker" : "Sent");
    if (!fork) setPrompt("");
  });
  const spawn = () => guard(async () => { await api.spawn(w.cwd, fresh, model || undefined); setFresh(""); setShowFresh(false); setNote("New worker started"); });
  const onEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>, submit: () => void, ok: boolean) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (ok) submit(); }
  };
  // A session open in a terminal must not get a second writer (two writers corrupt the transcript), so typing is still
  // allowed but the message starts a fork: a new worker that continues from this conversation.
  const forking = w.liveInTerminal || wantFork; // forced while a terminal holds the session, optional otherwise
  const canSend = prompt.trim().length > 0;
  const submit = () => (forking ? send(true, prompt).then(() => setPrompt("")) : send(false, prompt));

  return (
    <div className={`wc-root ${dock !== "float" ? "wc-docked" : ""}`} onWheel={stopProp}>
      <header className="wc-head">
        <BotIcon color={w.color} onPick={(c) => { void api.setBotColor(w.id, c).catch(() => {}); }} size={30} />
        <div className="wc-title">
          {renaming
            ? <input className="wc-rename" autoFocus defaultValue={w.name ?? ""} placeholder={w.title} maxLength={80}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") saveName(e.currentTarget.value); if (e.key === "Escape") setRenaming(false); }}
                onKeyUp={stopProp} onBlur={(e) => saveName(e.currentTarget.value)} />
            : <strong title="Click to rename" style={{ cursor: "text" }} onClick={() => setRenaming(true)}>{w.name || w.title || "(untitled)"} ✎</strong>}
          {w.name && <span className="wc-sub muted" title={w.title}>Session: {w.title}</span>}
          <span className="wc-sub"><StateBadge state={w.state} /> <span>{w.activity}</span></span>
        </div>
        {onDock && (
          <span className="wc-dockbtns">
            {([["left", "◧", "Pin to the left side"], ["float", "▣", "Float over the scene"], ["right", "◨", "Pin to the right side"]] as const).map(([d, ico, tip]) => (
              <button key={d} className={`icon-btn ${dock === d ? "on" : ""}`} title={tip} aria-label={tip} onClick={() => onDock(d)}>{ico}</button>
            ))}
          </span>
        )}
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </header>

      <div className="wc-body" ref={bodyRef}>
        {messages.length === 0 && <p className="wc-empty">No messages yet.</p>}
        {messages.map((m, i) => <Bubble key={`${m.at}-${i}`} m={m} color={w.color} />)}
        {busy && (
          <div className="wc-row wc-bot">
            <span className="wc-avatar"><BotIcon color={w.color} onPick={() => {}} size={22} title="" /></span>
            <div className="wc-bubble wc-typing" aria-label="working"><i /><i /><i /></div>
          </div>
        )}
      </div>

      <footer className="wc-foot">
        {w.liveInTerminal && (
          <div className="wc-live">
            <span>Live in terminal: sending into it directly could corrupt its transcript (two writers), so messages go to a fork</span>
            <button onClick={copy}>{copied ? "Copied" : "Copy resume command"}</button>
          </div>
        )}
        <label className="wc-forkopt" title="A fork continues from this conversation as a new worker and leaves this session untouched">
          <input type="checkbox" checked={forking} disabled={w.liveInTerminal} onChange={(e) => setWantFork(e.target.checked)} />
          {" "}Send as a fork (new worker){w.liveInTerminal ? " — required: a terminal holds this session" : ""}
        </label>
        <label className="wc-forkopt" title="Model used for the next message. Switching models mid-conversation is fine: the session keeps its history.">
          Model:{" "}
          <input list="wc-models" className="wc-model" value={model} placeholder="default" maxLength={80} onChange={(e) => setModel(e.target.value.trim())} onKeyDown={(e) => e.stopPropagation()} onKeyUp={stopProp} />
          <datalist id="wc-models"><option value="opus" /><option value="sonnet" /><option value="haiku" /></datalist>
        </label>
        <div className="wc-input">
          <textarea
            value={prompt}
            rows={2}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => onEnter(e, () => void submit(), canSend)}
            onKeyUp={stopProp}
            placeholder={forking ? "Enter starts a fork with this message" : "Message this worker (Enter to send)"}
            aria-label="Message"
          />
          <div className="wc-btns">
            <button disabled={!canSend} onClick={() => void submit()}>{forking ? "Fork & send" : "Send"}</button>
            {run?.status === "running" && <button onClick={() => guard(() => api.stop(run.runId).then(() => undefined))}>Stop</button>}
          </div>
        </div>
        {problem && (run?.status === "running" || problem.level === "error") && (
          <p className="wc-note wc-err" role="status">{problem.level === "retry" ? "⚠ " : "✖ "}{problem.text}{problem.level === "retry" ? " — use Stop to cancel" : ""}</p>
        )}
        {note && <p className="wc-note">{note}</p>}
        {err && <p className="wc-note wc-err" role="alert">{err}</p>}
        <div className="wc-new">
          {!showFresh
            ? <button className="wc-link" onClick={() => setShowFresh(true)}>＋ New worker here</button>
            : (
              <div className="wc-input">
                <textarea
                  value={fresh}
                  rows={2}
                  autoFocus
                  onChange={(e) => setFresh(e.target.value)}
                  onKeyDown={(e) => onEnter(e, () => void spawn(), fresh.trim().length > 0)}
                  onKeyUp={stopProp}
                  placeholder="Prompt for a new worker in this directory"
                  aria-label="New worker prompt"
                />
                <div className="wc-btns">
                  <button disabled={!fresh.trim()} onClick={spawn}>Spawn</button>
                  <button onClick={() => { setShowFresh(false); setFresh(""); }}>Cancel</button>
                </div>
              </div>
            )}
        </div>
      </footer>
    </div>
  );
}
