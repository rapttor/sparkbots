import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "../state/store";
import { displayName } from "../util";
import { isRateLimited, useSimChat, type ChatLine } from "./store";
import { getSettings, SPEED_MS, subscribeSettings } from "./settings";
import { shouldInitiate } from "./engine";
import { threadById } from "./data";
import { holdAgent, releaseAgent } from "../world/roam";
import "./simchat.css";

const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings);

/** Reveals `text` char by char (instantly when speed is 0). Calls onDone once finished. */
function Typed({ text, msPerChar, onDone }: { text: string; msPerChar: number; onDone: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) { onDone(); return; }
    const t = setTimeout(() => setN((x) => x + 1), msPerChar);
    return () => clearTimeout(t);
  }, [n, text, msPerChar, onDone]);
  return <>{text.slice(0, n)}</>;
}

function ChatWindow({ id }: { id: string }) {
  const worker = useStore((s) => s.snapshot?.teams.flatMap((t) => t.workers).find((w) => w.id === id));
  const chat = useSimChat((s) => s.chats[id]);
  const { close, choose, next } = useSimChat.getState();
  const { speed } = useSettings();
  const [mountAt] = useState(() => Date.now());
  const [done, setDone] = useState<Set<number>>(() => new Set()); // fresh bot lines that finished typing
  const log = useRef<HTMLDivElement>(null);
  const lines = chat?.lines ?? [];
  const ms = SPEED_MS[speed];
  // Lines that arrived while the window is open are revealed one after another: every earlier line is shown, the first
  // unfinished fresh bot line is typing, and everything after it waits.
  const isFresh = (l: ChatLine) => l.who === "bot" && ms > 0 && l.at >= mountAt - 50 && !done.has(l.id);
  const firstPending = lines.findIndex(isFresh);
  const shown = firstPending < 0 ? lines : lines.slice(0, firstPending + 1);
  const busy = firstPending >= 0;
  const finish = useCallback((id: number) => setDone((d) => (d.has(id) ? d : new Set(d).add(id))), []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [close]);
  const thread = chat?.threadId ? threadById(chat.threadId) : undefined;
  const options = chat?.nodeId && thread ? thread.nodes[chat.nodeId]?.options ?? [] : [];
  const render = (l: ChatLine, i: number) => (
    <div key={l.id} className={`sc-row ${l.who}`}><div className="sc-bubble">
      {i === firstPending ? <Typed text={l.text} msPerChar={ms} onDone={() => finish(l.id)} /> : l.text}
    </div></div>
  );
  return (
    <div className="sc-panel" role="dialog" aria-label="Water cooler chat">
      <div className="sc-head"><span>☕</span><strong>{worker ? displayName(worker) : "Agent"} · water cooler</strong><button className="icon-btn" aria-label="Close" onClick={close}>×</button></div>
      <div className="sc-log" ref={log}>{shown.map(render)}</div>
      <p className="sc-note">Simulated and offline: not the real agent, nothing is sent anywhere.</p>
      <div className="sc-opts">
        {!busy && options.map((o) => <button key={o.id} onClick={() => choose(id, o.id)}>{o.label}</button>)}
        {!busy && options.length === 0 && lines.length > 0 && <button onClick={() => next(id)}>Another topic…</button>}
      </div>
    </div>
  );
}

/** Mounted once in the 3D scene: shows the open chat window and lets idle / rate-limited agents start a thread. */
export function SimChatHost() {
  const openFor = useSimChat((s) => s.openFor);
  const settings = useSettings();
  const snapshot = useStore((s) => s.snapshot);
  const idleSince = useRef<Record<string, number>>({});
  const workers = useMemo(() => snapshot?.teams.flatMap((t) => t.workers) ?? [], [snapshot]);
  // The agent you are chatting with stays put (no games, no wandering off) while the window is open.
  useEffect(() => {
    if (!openFor || !settings.enabled) return;
    holdAgent(openFor);
    return () => releaseAgent(openFor);
  }, [openFor, settings.enabled]);
  const workersRef = useRef(workers);
  workersRef.current = workers; // the timer must not restart on every snapshot (they arrive every few seconds, the tick is 20 s)
  useEffect(() => {
    if (!settings.enabled || !settings.idleStart) return;
    const tick = async () => {
      const limited = await isRateLimited(); // rate-limit mode: agents are more talkative
      const now = Date.now(); const st = useSimChat.getState();
      for (const w of workersRef.current) {
        if (w.state !== "idle" && !limited) { delete idleSince.current[w.id]; continue; }
        const since = (idleSince.current[w.id] ??= now);
        const last = st.chats[w.id]?.lastStartedAt ?? 0;
        if (shouldInitiate({ idleMs: now - since, sinceLastMs: now - last, roll: Math.random(), minIdleMs: limited ? 15_000 : 90_000, cooldownMs: limited ? 120_000 : 600_000 })) { st.initiate(w.id); break; }
      }
    };
    const t = setInterval(() => void tick(), 20_000);
    return () => clearInterval(t);
  }, [settings.enabled, settings.idleStart]);
  if (!settings.enabled || !openFor) return null;
  return <ChatWindow id={openFor} />;
}

/** Unread dot for the agent menu item. */
export function SimChatUnread({ id }: { id: string }) {
  const n = useSimChat((s) => s.chats[id]?.unread ?? 0);
  return n > 0 ? <span className="sc-dot" title={`${n} unread`} /> : null;
}
