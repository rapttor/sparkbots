import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { StateBadge } from "../panels/Badge";
import { BotIcon } from "../panels/BotIcon";
import { api, call, type ChatMessage, type RunRecord } from "../api";
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

/** The run failed because the endpoint does not know the model. Say where the run is going and offer the likely fixes. */
function ModelHelp({ onTry }: { onTry: (m: string) => void }) {
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof api.claudeSetup>> | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [done, setDone] = useState("");
  useEffect(() => {
    api.claudeSetup().then(setSetup).catch(() => {});
    call<{ status?: { models?: string[] } }[]>("GET", "/api/services").then((l) => setModels([...new Set(l.flatMap((s) => s.status?.models ?? []))].slice(0, 12))).catch(() => {});
  }, []);
  const clean = () => api.saveConfig({ cleanEnv: true }).then(() => { setDone("Clean environment is on. Send the message again."); api.claudeSetup().then(setSetup).catch(() => {}); }).catch((e: Error) => setDone(e.message));
  return (
    <div className="wc-help">
      <p className="small">
        The service this run talks to does not know that model.
        {setup?.inheritedGatewayHost ? <> SparkBots' server has <b>ANTHROPIC_BASE_URL</b> set, so runs go to <b>{setup.inheritedGatewayHost}</b>{/11434/.test(setup.inheritedGatewayHost) ? " (that is Ollama's port)" : ""}, not to Anthropic.</> : null}
      </p>
      <div className="wc-help-actions">
        {setup?.inheritedGatewayHost && !setup.cleanEnv && <button className="small" onClick={() => void clean()}>Use real Claude (drop ANTHROPIC_* variables)</button>}
        {models.length > 0 && <span className="small muted">or pick a model that service has:</span>}
        {models.map((m) => <button key={m} className="chip" onClick={() => onTry(m)}>{m}</button>)}
      </div>
      {done && <p className="small">{done}</p>}
    </div>
  );
}

const MAX_FILES = 8, MAX_FILE_BYTES = 15 * 1024 * 1024;
/** File -> base64 (in chunks, so big files do not overflow the call stack). */
async function toBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
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
  const [files, setFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // model for the next message; remembered per agent in this browser ("" = Claude Code's default)
  const [model, setModelState] = useState(() => { try { return localStorage.getItem(`ao.model.${workerId}`) ?? ""; } catch { return ""; } });
  const setModel = (m: string) => { setModelState(m); try { localStorage.setItem(`ao.model.${workerId}`, m); } catch { /* private mode */ } };
  useEffect(() => { try { setModelState(localStorage.getItem(`ao.model.${workerId}`) ?? ""); } catch { setModelState(""); } }, [workerId]);
  const [problem, setProblem] = useState<RunProblem | null>(null);
  const [svcModels, setSvcModels] = useState<string[]>([]); // models of the services you added (Ollama, ...): usable names for the Model box
  useEffect(() => { call<{ status?: { models?: string[] } }[]>("GET", "/api/services").then((l) => setSvcModels([...new Set(l.flatMap((s) => s.status?.models ?? []))].slice(0, 30))).catch(() => {}); }, []);
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
    // Wait until React has painted the newly appended bubble/typing row, then pin the conversation to its end.
    const frame = requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!w) return null;
  const isCodex = w.source === "codex";
  const codexThread = isCodex ? w.id.replace(/^codex:/, "") : "";
  const cmd = isCodex ? `cd ${w.cwd} && codex resume ${codexThread}` : `cd ${w.cwd} && claude --resume ${w.id}`;
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
    const r = await api.send(w.id, text || "Please look at the attached file(s).", fork, model || undefined, files.map((f) => f.id));
    setNote(r.queued ? `Queued (position ${r.position})` : fork ? "Forked to a new agent" : "Sent");
    setPrompt(""); setFiles([]);
  });
  // Files are read in the browser, saved by the server in SparkBots' own folder, and listed in the message (Claude reads them).
  const attach = async (list: FileList | File[]) => {
    setErr("");
    for (const f of Array.from(list)) {
      if (files.length + uploading >= MAX_FILES) { setErr(`At most ${MAX_FILES} files per message.`); break; }
      if (f.size > MAX_FILE_BYTES) { setErr(`${f.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`); continue; }
      setUploading((n) => n + 1);
      try {
        const u = await api.upload(f.name || "pasted-file", await toBase64(f));
        setFiles((cur) => [...cur, u]);
      } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
      setUploading((n) => n - 1);
    }
  };
  const spawn = () => guard(async () => { await api.spawn(w.cwd, fresh, model || undefined); setFresh(""); setShowFresh(false); setNote("New worker started"); });
  const onEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>, submit: () => void, ok: boolean) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (ok) submit(); }
  };
  // A session open in a terminal must not get a second writer (two writers corrupt the transcript): Send explains this when
  // you press it, and "Send as fork" starts a new agent that continues from this conversation.
  const hasContent = prompt.trim().length > 0 || files.length > 0;
  const terminalNote = "Live in terminal: sending into it directly could corrupt its transcript (two writers), so use “Send as fork”.";
  const onSend = () => { if (!isCodex && w.liveInTerminal) { setNote(terminalNote); return; } if (hasContent) void send(false, prompt); };
  const onFork = () => { if (hasContent) void send(true, prompt); };

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

      <footer className="wc-foot" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void attach(e.dataTransfer.files); } }}>
        {(files.length > 0 || uploading > 0) && (
          <div className="wc-files">
            {files.map((f) => <span key={f.id} className="chip on" title={`${f.name} (${Math.round(f.size / 1024)} KB)`}>📎 {f.name}<button className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((c) => c.filter((x) => x.id !== f.id))}>×</button></span>)}
            {uploading > 0 && <span className="muted small">uploading…</span>}
          </div>
        )}
        <div className="wc-compose">
          <textarea
            value={prompt}
            rows={3}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => onEnter(e, onSend, true)}
            onKeyUp={stopProp}
            onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void attach(e.clipboardData.files); } }}
            placeholder={isCodex ? "Message this Codex agent (Enter to send)" : "Message this agent (Enter to send, Shift+Enter for a new line). Drop or paste files to attach."}
            aria-label="Message"
          />
          <div className="wc-btns">
            <button className={`wc-send ${hasContent && (isCodex || !w.liveInTerminal) ? "" : "off"}`} aria-disabled={!hasContent || (!isCodex && w.liveInTerminal)} onClick={onSend} title={!isCodex && w.liveInTerminal ? "Open in a terminal: use Send as fork" : "Send"}>Send</button>
            {!isCodex && <div className="wc-forkrow">
              <button className={`small ${hasContent ? "" : "off"}`} aria-disabled={!hasContent} onClick={onFork} title="A new agent that continues from this conversation">
                Send as fork{w.liveInTerminal ? " · required" : ""}
              </button>
              <button className="icon-btn wc-info" aria-label="About forking" aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)}>ⓘ</button>
            </div>}
            {run?.status === "running" && <button className="small" onClick={() => guard(() => api.stop(run.runId).then(() => undefined))}>Stop</button>}
          </div>
        </div>
        {infoOpen && (
          <div className="wc-infobox" role="note">
            <p className="small">
              {w.liveInTerminal
                ? <><b>A terminal is holding this session.</b> Writing into it from here could corrupt its conversation (two writers at once), so your message goes to a <b>fork</b>: a new agent that continues from this chat and leaves this session untouched.</>
                : <>A <b>fork</b> is a new agent that continues from this conversation and leaves this session untouched. Plain Send continues the session itself.</>}
            </p>
            {w.liveInTerminal && <button className="small" onClick={copy}>{copied ? "Copied" : "Copy resume command (continue it in the terminal)"}</button>}
          </div>
        )}
        <div className="wc-tools">
          {!isCodex && <><button className="small" onClick={() => fileInput.current?.click()} title="Attach files or images (max 15 MB each)">📎 Attach</button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) void attach(e.target.files); e.target.value = ""; }} /></>}
          {!isCodex && <label className="wc-forkopt" title="Model used for the next message. Switching models mid-conversation is fine: the session keeps its history.">
            Model:{" "}
            <input list="wc-models" className="wc-model" value={model} placeholder="default" maxLength={80} onChange={(e) => setModel(e.target.value.trim())} onKeyDown={(e) => e.stopPropagation()} onKeyUp={stopProp} />
            <datalist id="wc-models"><option value="opus" /><option value="sonnet" /><option value="haiku" />{svcModels.map((m) => <option key={m} value={m} />)}</datalist>
          </label>}
        </div>
        {problem?.kind === "model" && <ModelHelp onTry={(m) => { setModel(m); }} />}
        {problem && (run?.status === "running" || problem.level === "error") && (
          <p className="wc-note wc-err" role="status">{problem.level === "retry" ? "⚠ " : "✖ "}{problem.text}{problem.level === "retry" ? " — use Stop to cancel" : ""}</p>
        )}
        {note && <p className="wc-note">{note}</p>}
        {err && <p className="wc-note wc-err" role="alert">{err}</p>}
        {!isCodex && <div className="wc-new">
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
        </div>}
      </footer>
    </div>
  );
}
