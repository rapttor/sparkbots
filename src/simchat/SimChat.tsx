import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { useStore } from "../state/store";
import { registerMode } from "../state/modes";
import { player, roams } from "../world/roam";
import { useSwallowEvents } from "../world/games/swallow";
import { isRateLimited, useSimChat, type ChatLine } from "./store";
import { getSettings, subscribeSettings } from "./settings";
import { distanceStep, optionForKey, step } from "./pacing";
import { shouldInitiate } from "./engine";
import { threadById } from "./data";
import { TOPICS, TOPIC_INFO } from "./schema";
import { useSyncExternalStore } from "react";
import "./simchat.css";

const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings);
const AGENT_Y = 2.25, ME_Y = 2.2;
const ME_SHOW_MS = 5000; // your own bubble fades away this long after you said it (the agent's stays until it has more to say)

/** A chat bubble drawn as DOM at a 3D point. Follows `at()` every frame (an agent walks, the hand moves). */
function Anchored({ at, y, children }: { at: () => { x: number; z: number } | null; y: number; children: React.ReactNode }) {
  const g = useRef<Group>(null);
  useFrame(() => { const p = at(); if (g.current && p) g.current.position.set(p.x, y, p.z); });
  return <group ref={g}><Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>{children}</Html></group>;
}

/** Everything inside a clickable bubble part stays there: no click reaches the 3D scene (the hand would move). */
function Clickable({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useSwallowEvents();
  return <div ref={ref} className={className} style={{ pointerEvents: "auto", cursor: "pointer" }}>{children}</div>;
}

function Bubble({ who, line, prev, typed, onContinue, onTopic, onClose }: { who: "bot" | "me"; line: ChatLine; prev?: ChatLine; typed: number; onContinue?: () => void; onTopic?: () => void; onClose?: () => void }) {
  return (
    <div className={`sc-bub ${who}`}>
      {prev && <div className="sc-prev">{prev.text}</div>}
      <div className="sc-text">{line.text.slice(0, typed)}<span className="sc-ghost">{line.text.slice(typed)}</span></div>
      {(onContinue || onTopic || onClose) && (
        <Clickable className="sc-cont">
          {onTopic && <button className="sc-mini" title="Change the topic" onClick={onTopic}>🔀 Topic</button>}
          {onContinue && <button onClick={onContinue}>continue ▸</button>}
          {onClose && <button className="sc-mini" title="End the chat" aria-label="End the chat" onClick={onClose}>✕ Bye</button>}
        </Clickable>
      )}
    </div>
  );
}

/** The conversation: the active chat's lines shown one by one as bubbles above the speakers, the options offered under ours. */
function ActiveChat({ id }: { id: string }) {
  const chat = useSimChat((s) => s.chats[id]);
  const from = useSimChat((s) => s.from);
  const { choose, next, close, startTopic } = useSimChat.getState();
  const settings = useSettings();
  const lines = useMemo(() => chat?.lines ?? [], [chat]);
  const [idx, setIdx] = useState(Math.min(from, Math.max(0, lines.length - 1)));
  const [t0, setT0] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const opened = useRef(performance.now()); const armed = useRef(false);
  const worker = useStore((s) => s.snapshot?.teams.flatMap((t) => t.workers).find((w) => w.id === id));
  const shownIdx = Math.min(idx, lines.length - 1);
  const cur = lines[shownIdx];
  const nextWho = lines[shownIdx + 1]?.who ?? null;
  const thread = chat?.threadId ? threadById(chat.threadId) : undefined;
  const options = chat?.nodeId && thread ? thread.nodes[chat.nodeId]?.options ?? [] : [];
  const out = cur ? step({ elapsedMs: now - t0, len: cur.text.length, speed: settings.speed, auto: settings.advance === "auto", next: nextWho, hasOptions: options.length > 0 }) : null;
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false); pickingRef.current = picking;
  const goNext = () => { setIdx(shownIdx + 1); setT0(performance.now()); };

  useEffect(() => { const h = setInterval(() => setNow(performance.now()), 50); return () => clearInterval(h); }, []);
  useEffect(() => { if (out?.advance) goNext(); }); // eslint-disable-line react-hooks/exhaustive-deps
  // the agent you talk to comes to you like a follower (it wakes up if it slept) and goes back to what it did when the chat ends
  useEffect(() => {
    const st = useStore.getState();
    if (st.followers.includes(id)) return;
    st.toggleFollower(id);
    return () => { const s2 = useStore.getState(); if (s2.followers.includes(id)) s2.toggleFollower(id); };
  }, [id]);
  // the agent started real work, or went away: the chat ends by itself
  useEffect(() => { if (worker && (worker.state === "working" || worker.state === "waiting")) close(); }, [worker?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // walking away from the agent ends the chat (with hysteresis)
  useEffect(() => {
    const h = setInterval(() => {
      const r = roams.get(id); if (!r || !player.on) return;
      const d = distanceStep(Math.hypot(player.x - r.x, player.z - r.z), armed.current, performance.now() - opened.current);
      armed.current = d.armed; if (d.end) close();
    }, 300);
    return () => clearInterval(h);
  }, [id, close]);
  // keys: 1-9 pick an option, Enter continues
  const keys = useRef({ options, canContinue: false, pick: (_: string) => {}, go: () => {} });
  keys.current = { options, canContinue: !!out?.canContinue, pick: (o) => choose(id, o), go: goNext };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input,textarea,select")) return;
      const { options: o, canContinue, pick, go } = keys.current;
      const i = pickingRef.current ? -1 : optionForKey(e.key, o.length);
      if (i >= 0) { e.stopImmediatePropagation(); e.preventDefault(); pick(o[i].id); setIdx((x) => x + 1); setT0(performance.now()); }
      else if (e.key === "Enter" && canContinue) { e.stopImmediatePropagation(); e.preventDefault(); go(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);

  if (!cur) return null;
  const lastOf = (who: "bot" | "me"): number => { for (let i = shownIdx; i >= 0; i--) if (lines[i].who === who) return i; return -1; };
  const bi = lastOf("bot"), mi = lastOf("me");
  const prevOf = (i: number): ChatLine | undefined => { for (let k = i - 1; k >= 0 && k > i - 4; k--) if (lines[k].who === lines[i].who) return lines[k]; return undefined; };
  const agentAt = () => { const r = roams.get(id); return r ? { x: r.x, z: r.z } : null; };
  const meAt = () => { const r = roams.get(id); return player.on ? { x: player.x, z: player.z } : r ? { x: r.x + 1.6, z: r.z + 1.6 } : null; };
  const typedFor = (i: number) => (i === shownIdx && out ? out.typed : lines[i].text.length);
  const pickTopic = (tp: string | undefined) => { setPicking(false); startTopic(id, tp); setIdx(lines.length); setT0(performance.now()); };
  const pickOpt = (oid: string) => { choose(id, oid); setIdx(shownIdx + 1); setT0(performance.now()); };
  return (
    <>
      {bi >= 0 && <Anchored at={agentAt} y={AGENT_Y}><Bubble who="bot" line={lines[bi]} prev={prevOf(bi)} typed={typedFor(bi)} onContinue={bi === shownIdx && out?.canContinue ? goNext : undefined} onTopic={() => setPicking((p) => !p)} onClose={close} /></Anchored>}
      {mi >= 0 && Date.now() - lines[mi].at < ME_SHOW_MS && <Anchored at={meAt} y={ME_Y}><Bubble who="me" line={lines[mi]} prev={prevOf(mi)} typed={typedFor(mi)} /></Anchored>}
      {(picking || out?.showOptions || (out?.done && nextWho === null && options.length === 0)) && (
        <Anchored at={meAt} y={ME_Y - 0.9}>
          <Clickable className="sc-opts3">
            {picking ? (
              <>
                <div className="sc-ask">Let&apos;s talk about…</div>
                <div className="sc-topics">
                  {TOPICS.map((tp) => <button key={tp} onClick={() => pickTopic(tp)}><span className="sc-ti">{TOPIC_INFO[tp].icon}</span>{TOPIC_INFO[tp].label}</button>)}
                  <button onClick={() => pickTopic(undefined)}><span className="sc-ti">🎲</span>Surprise me</button>
                </div>
                <button className="sc-bye" onClick={() => setPicking(false)}>Back</button>
              </>
            ) : (
              <>
                {options.length > 0 && <div className="sc-ask">What do you say?</div>}
                {options.map((o, i) => <button key={o.id} onClick={() => pickOpt(o.id)}><kbd>{i + 1}</kbd> {o.label}</button>)}
                {options.length === 0 && <button onClick={() => { next(id); setIdx(lines.length); setT0(performance.now()); }}>Another one…</button>}
                <button onClick={() => setPicking(true)}>🔀 Change the topic…</button>
                <button className="sc-bye" onClick={close}>Bye for now</button>
              </>
            )}
          </Clickable>
        </Anchored>
      )}
    </>
  );
}

/** Mounted once inside the 3D canvas: registers the "Chat" special mode (header Stop ends it), shows the active chat as bubbles, and lets idle / rate-limited agents start a thread. */
export function SimChatBubbles() {
  const openFor = useSimChat((s) => s.openFor);
  const settings = useSettings();
  const snapshot = useStore((s) => s.snapshot);
  const idleSince = useRef<Record<string, number>>({});
  const workers = useMemo(() => snapshot?.teams.flatMap((t) => t.workers) ?? [], [snapshot]);
  useEffect(() => registerMode({ id: "simchat", label: "Chat", active: () => !!useSimChat.getState().openFor, stop: () => useSimChat.getState().close() }), []);
  useEffect(() => {
    if (!settings.enabled || !settings.idleStart) return;
    const tick = () => {
      const limited = isRateLimited(); // rate-limit mode: agents are more talkative
      const now = Date.now(); const st = useSimChat.getState();
      for (const w of workers) {
        if (w.state !== "idle" && !limited) { delete idleSince.current[w.id]; continue; }
        const since = (idleSince.current[w.id] ??= now);
        const last = st.chats[w.id]?.lastStartedAt ?? 0;
        if (st.openFor !== w.id && shouldInitiate({ idleMs: now - since, sinceLastMs: now - last, roll: Math.random(), minIdleMs: limited ? 15_000 : 90_000, cooldownMs: limited ? 120_000 : 600_000 })) { st.initiate(w.id); break; }
      }
    };
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [workers, settings.enabled, settings.idleStart]);
  if (!settings.enabled || !openFor) return null;
  return <ActiveChat key={openFor} id={openFor} />;
}

/** Unread dot for the agent menu item. */
export function SimChatUnread({ id }: { id: string }) {
  const n = useSimChat((s) => s.chats[id]?.unread ?? 0);
  return n > 0 ? <span className="sc-dot" title={`${n} unread`} /> : null;
}
