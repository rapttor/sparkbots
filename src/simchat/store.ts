import { create } from "zustand";
import type { SimThread } from "./schema";
import { allowedThreads, threadById } from "./data";
import { chainTarget, follow, pickThread } from "./engine";
import { getSettings } from "./settings";

export interface ChatLine { id: number; who: "bot" | "me"; text: string; at: number }
interface AgentChat {
  lines: ChatLine[];
  threadId: string | null;     // the thread in progress
  nodeId: string | null;       // the node whose options are showing (null once the thread ended)
  seen: string[];              // thread ids already told, in order
  unread: number;              // bot lines the user has not seen (chat closed)
  lastStartedAt: number;       // for the idle-initiation cooldown
  chain?: string;              // the finished thread's chain request ("random" or a thread id)
}
interface SimChatState {
  chats: Record<string, AgentChat>;
  openFor: string | null;      // agent whose chat window is open
  open: (agentId: string) => void;
  close: () => void;
  start: (agentId: string, threadId?: string) => void;
  choose: (agentId: string, optionId: string) => void;
  next: (agentId: string) => void;          // after an ended thread: chain or pick another
  initiate: (agentId: string) => boolean;   // idle start: a greeting with an unread dot; false if disabled
}

const KEY = "ao.simchat.history";
const MAX_LINES = 200;
let n = 0;
const empty = (): AgentChat => ({ lines: [], threadId: null, nodeId: null, seen: [], unread: 0, lastStartedAt: 0 });
function load(): Record<string, AgentChat> {
  try { const j = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, AgentChat>; for (const c of Object.values(j)) for (const l of c.lines) n = Math.max(n, l.id); return j; } catch { return {}; }
}
function save(c: Record<string, AgentChat>) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode */ } }

const pool = (): SimThread[] => allowedThreads(getSettings().filter);
const add = (c: AgentChat, who: "bot" | "me", text: string): ChatLine => { const l = { id: ++n, who, text, at: Date.now() }; c.lines = [...c.lines, l].slice(-MAX_LINES); return l; };

/** Whether the rate-limit mode is on. The flag may not exist in the store yet, so read it defensively. */
export async function isRateLimited(): Promise<boolean> {
  try { const m = await import("../state/store"); return Boolean((m.useStore.getState() as unknown as { rateLimited?: unknown }).rateLimited); } catch { return false; }
}

export const useSimChat = create<SimChatState>((set, get) => {
  const update = (agentId: string, fn: (c: AgentChat) => void, extra?: Partial<SimChatState>) => {
    const chats = { ...get().chats }; const c = { ...(chats[agentId] ?? empty()) }; fn(c); chats[agentId] = c; save(chats); set({ chats, ...extra });
  };
  /** Begin `t` for an agent: its opening lines, then the start node's options. */
  const begin = (agentId: string, t: SimThread, c: AgentChat) => {
    const node = t.nodes[t.start];
    for (const s of node.say) add(c, "bot", s);
    c.threadId = t.id; c.seen = [...c.seen.filter((x) => x !== t.id), t.id];
    c.nodeId = node.end ? null : t.start; c.chain = node.end ? node.chain : undefined; c.lastStartedAt = Date.now();
    if (get().openFor !== agentId) c.unread += node.say.length;
  };
  return {
    chats: load(), openFor: null,
    open: (agentId) => { update(agentId, (c) => { c.unread = 0; }, { openFor: agentId }); if (!get().chats[agentId]?.lines.length) get().start(agentId); },
    close: () => set({ openFor: null }),
    start: (agentId, threadId) => update(agentId, (c) => {
      const t = (threadId ? threadById(threadId) : undefined) ?? pickThread(pool(), c.seen);
      if (t) begin(agentId, t, c);
    }),
    choose: (agentId, optionId) => update(agentId, (c) => {
      const t = c.threadId ? threadById(c.threadId) : undefined; if (!t || !c.nodeId) return;
      const opt = t.nodes[c.nodeId]?.options?.find((o) => o.id === optionId); const step = follow(t, c.nodeId, optionId);
      if (!opt || !step) return;
      add(c, "me", opt.label);
      for (const s of step.node.say) add(c, "bot", s);
      c.nodeId = step.node.end ? null : step.id; c.chain = step.node.end ? step.node.chain : undefined;
      if (get().openFor !== agentId) c.unread += step.node.say.length;
    }),
    next: (agentId) => update(agentId, (c) => {
      const t = c.threadId ? threadById(c.threadId) : undefined;
      const target = t && c.chain ? chainTarget({ say: [], end: true, chain: c.chain }, t, pool(), c.seen) : null;
      const nt = target ?? pickThread(pool(), c.seen, Math.random, t?.topic);
      if (nt) begin(agentId, nt, c);
    }),
    initiate: (agentId) => {
      if (!getSettings().enabled) return false;
      const c = get().chats[agentId];
      if (c?.nodeId) return false; // a conversation is already waiting for the user
      get().start(agentId); return true;
    },
  };
});
