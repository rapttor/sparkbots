import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "../state/store";
import { displayName } from "../util";
import { isRateLimited, useSimChat, type ChatLine } from "./store";
import { getSettings, SPEED_MS, subscribeSettings } from "./settings";
import { shouldInitiate } from "./engine";
import { threadById } from "./data";
import "./simchat.css";

const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings);

/** Reveals `text` char by char (instantly when speed is 0). Calls onDone once finished. */
function Typed({ text, msPerChar, animate, onDone }: { text: string; msPerChar: number; animate: boolean; onDone: () => void }) {
  const [n, setN] = useState(animate && msPerChar > 0 ? 0 : text.length);
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
  const [typing, setTyping] = useState<number | null>(null); // id of the line being typed
  const log = useRef<HTMLDivElement>(null);
  const lines = chat?.lines ?? [];
  const lastBot = [...lines].reverse().find((l) => l.who === "bot");
  const busy = typing !== null && typing === lastBot?.id;
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [close]);
  const thread = chat?.threadId ? threadById(chat.threadId) : undefined;
  const options = chat?.nodeId && thread ? thread.nodes[chat.nodeId]?.options ?? [] : [];
  const render = (l: ChatLine) => {
    const fresh = l.who === "bot" && l.at >= mountAt - 50 && l.id === lastBot?.id;
    return (
      <div key={l.id} className={`sc-row ${l.who}`}><div className="sc-bubble">
        {fresh ? <Typed text={l.text} msPerChar={SPEED_MS[speed]} animate onDone={() => setTyping((t) => (t === l.id ? null : t))} /> : l.text}
      </div></div>
    );
  };
  useEffect(() => { if (lastBot && lastBot.at >= mountAt - 50 && SPEED_MS[speed] > 0) setTyping(lastBot.id); }, [lastBot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sc-panel" role="dialog" aria-label="Water cooler chat">
      <div className="sc-head"><span>☕</span><strong>{worker ? displayName(worker) : "Agent"} · water cooler</strong><button className="icon-btn" aria-label="Close" onClick={close}>×</button></div>
      <div className="sc-log" ref={log}>{lines.map(render)}</div>
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
  useEffect(() => {
    if (!settings.enabled || !settings.idleStart) return;
    const tick = async () => {
      const limited = await isRateLimited(); // rate-limit mode: agents are more talkative
      const now = Date.now(); const st = useSimChat.getState();
      for (const w of workers) {
        if (w.state !== "idle" && !limited) { delete idleSince.current[w.id]; continue; }
        const since = (idleSince.current[w.id] ??= now);
        const last = st.chats[w.id]?.lastStartedAt ?? 0;
        if (shouldInitiate({ idleMs: now - since, sinceLastMs: now - last, roll: Math.random(), minIdleMs: limited ? 15_000 : 90_000, cooldownMs: limited ? 120_000 : 600_000 })) { st.initiate(w.id); break; }
      }
    };
    const t = setInterval(() => void tick(), 20_000);
    return () => clearInterval(t);
  }, [workers, settings.enabled, settings.idleStart]);
  if (!settings.enabled || !openFor) return null;
  return <ChatWindow id={openFor} />;
}

/** Unread dot for the agent menu item. */
export function SimChatUnread({ id }: { id: string }) {
  const n = useSimChat((s) => s.chats[id]?.unread ?? 0);
  return n > 0 ? <span className="sc-dot" title={`${n} unread`} /> : null;
}
