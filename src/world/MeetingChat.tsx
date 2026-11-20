import { useState } from "react";
import { api } from "../api";
import { useLive } from "../state/live";
import { useStore } from "../state/store";
import { BotIcon } from "../panels/BotIcon";
import { displayName } from "../util";
import type { ChatMessage } from "../api";

const MAX = 12;
type Status = { text: string; err?: boolean };

/** One message to every agent that follows you (typically seated in the conference room), and what each of them answers. */
export function MeetingChat({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot);
  const followers = useStore((s) => s.followers);
  const all = snapshot?.teams.flatMap((t) => t.workers) ?? [];
  const people = followers.map((id) => all.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [last, setLast] = useState<Record<string, ChatMessage | undefined>>({});
  const [busy, setBusy] = useState(false);

  useLive(async () => {
    const out: Record<string, ChatMessage | undefined> = {};
    await Promise.all(people.slice(0, MAX).map(async (w) => {
      try { out[w.id] = (await api.sessionMessages(w.id)).messages.filter((m) => m.role === "assistant").slice(-1)[0]; } catch { /* ignore */ }
    }));
    setLast(out);
  }, ["messages"], undefined, people.length > 0);

  const forks = people.filter((w) => w.liveInTerminal).length;
  const send = async () => {
    const msg = text.trim();
    if (!msg || !people.length) return;
    const ok = window.confirm(
      `Send this message to ${people.length} agent${people.length === 1 ? "" : "s"}?\n\n${msg}\n\n` +
      `${forks ? `${forks} of them are open in a terminal: for those a fork (a new agent) is started instead.\n` : ""}Each one runs it as its own message, which uses tokens.`);
    if (!ok) return;
    setBusy(true);
    const next: Record<string, Status> = {};
    await Promise.all(people.map(async (w) => {
      try { const r = await api.send(w.id, msg, w.liveInTerminal); next[w.id] = { text: r.queued ? `queued (${r.position})` : w.liveInTerminal ? "forked" : "sent" }; }
      catch (e) { next[w.id] = { text: (e as Error).message, err: true }; }
    }));
    setStatus(next); setText(""); setBusy(false);
  };
  const tooMany = people.length > MAX;

  return (
    <div className="wc-root meeting" onWheel={(e) => e.stopPropagation()}>
      <header className="wc-head">
        <strong style={{ flex: 1 }}>💬 Meeting · {people.length} agent{people.length === 1 ? "" : "s"}</strong>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </header>
      <div className="wc-body">
        {people.length === 0 && <p className="wc-empty">Nobody is following you. Shift+click agents or press F next to one.</p>}
        {people.map((w) => (
          <div key={w.id} className="mt-row">
            <BotIcon color={w.color} onPick={() => {}} size={20} title="" />
            <div style={{ minWidth: 0 }}>
              <div className="small"><b>{displayName(w)}</b> <span className="muted">{w.state}</span>{status[w.id] && <span className={status[w.id]!.err ? "s-error" : "s-working"}> · {status[w.id]!.text}</span>}</div>
              {last[w.id] && <div className="mt-said">{last[w.id]!.text}</div>}
            </div>
          </div>
        ))}
      </div>
      <footer className="wc-foot">
        {tooMany && <p className="wc-note wc-err">At most {MAX} agents per meeting.</p>}
        <div className="wc-input">
          <textarea rows={2} value={text} placeholder="One message for everyone in the meeting" aria-label="Meeting message"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} onKeyUp={(e) => e.stopPropagation()} />
          <div className="wc-btns"><button disabled={busy || !text.trim() || !people.length || tooMany} onClick={() => void send()}>Send to all</button></div>
        </div>
      </footer>
    </div>
  );
}
