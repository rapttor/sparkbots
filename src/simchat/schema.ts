/** Simulated ("water cooler") chat: schema + validator. Pure data and pure functions: no network, no DOM, no node APIs. */

export const TOPICS = ["games", "cars", "life", "work"] as const;
export type Topic = (typeof TOPICS)[number];
export const RATINGS = ["G", "PG", "PG13"] as const;
export type Rating = (typeof RATINGS)[number];

/** A button the user can press. `next` is a node id inside the same thread. */
export interface SimOption { id: string; label: string; next: string }
/** One step of a thread: the bot says 1-4 short lines, then either offers options or ends. */
export interface SimNode {
  say: string[];
  options?: SimOption[];
  end?: true;
  /** Only on end nodes: the thread to chain into next ("random" picks any other thread of the same topic). */
  chain?: string;
}
export interface SimThread {
  id: string;
  topic: Topic;
  title: string;
  /** G = anyone, PG = mild banter, PG13 = light swearing-free adult life/humour. The content filter hides ratings above the chosen level. */
  rating: Rating;
  start: string;
  nodes: Record<string, SimNode>;
}

export const LIMITS = { sayLines: 4, sayChars: 240, options: 4, labelChars: 60, nodes: 40 };

/** Words that must never appear in a bundled thread (slurs, sexual content, hard profanity). Whole-word, case-insensitive. */
export const BANNED_WORDS = [
  "fuck", "fucking", "shit", "bitch", "cunt", "dick", "cock", "pussy", "whore", "slut", "porn", "nude", "naked", "sex", "sexy", "rape", "nigger", "nigga", "faggot", "fag", "retard", "retarded", "tranny", "spic", "chink", "kike", "asshole", "bastard", "cum", "boobs", "orgasm",
];
const bannedRe = new RegExp(`\\b(${BANNED_WORDS.join("|")})\\b`, "i");
export const hasBanned = (s: string): string | null => bannedRe.exec(s)?.[1] ?? null;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = /^[a-z0-9][a-z0-9_.-]*$/;

/** Check one thread. Returns a list of human-readable problems (empty = valid). Never throws. */
export function validateThread(t: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(t)) return ["thread is not an object"];
  const tid = typeof t.id === "string" ? t.id : "?";
  const e = (m: string) => errs.push(`${tid}: ${m}`);
  if (typeof t.id !== "string" || !ID.test(t.id)) e("id must be lowercase letters, digits, - _ .");
  if (!TOPICS.includes(t.topic as Topic)) e(`topic must be one of ${TOPICS.join(", ")}`);
  if (typeof t.title !== "string" || !t.title.trim()) e("title missing");
  else if (hasBanned(t.title)) e(`banned word in title: ${hasBanned(t.title)}`);
  if (!RATINGS.includes(t.rating as Rating)) e(`rating must be one of ${RATINGS.join(", ")}`);
  if (typeof t.start !== "string") e("start missing");
  if (!isObj(t.nodes)) { e("nodes missing"); return errs; }
  const nodes = t.nodes as Record<string, unknown>;
  const names = Object.keys(nodes);
  if (names.length === 0) e("no nodes");
  if (names.length > LIMITS.nodes) e(`more than ${LIMITS.nodes} nodes`);
  if (typeof t.start === "string" && !(t.start in nodes)) e(`start node "${t.start}" does not exist`);
  const optIds = new Set<string>();
  for (const [nid, raw] of Object.entries(nodes)) {
    const n = (m: string) => e(`node ${nid}: ${m}`);
    if (!ID.test(nid)) n("id must be lowercase letters, digits, - _ .");
    if (!isObj(raw)) { n("not an object"); continue; }
    if (!Array.isArray(raw.say) || raw.say.length < 1 || raw.say.length > LIMITS.sayLines) n(`say must have 1-${LIMITS.sayLines} lines`);
    else for (const line of raw.say) {
      if (typeof line !== "string" || !line.trim()) n("empty say line");
      else {
        if (line.length > LIMITS.sayChars) n(`say line over ${LIMITS.sayChars} chars`);
        const b = hasBanned(line); if (b) n(`banned word: ${b}`);
      }
    }
    const opts = raw.options;
    const ends = raw.end === true;
    if (ends && opts !== undefined) n("an end node must not have options");
    if (!ends && !Array.isArray(opts)) n("needs options or end:true");
    if (raw.chain !== undefined && (!ends || typeof raw.chain !== "string")) n("chain is only allowed (as a string) on end nodes");
    if (Array.isArray(opts)) {
      if (opts.length < 1 || opts.length > LIMITS.options) n(`options must be 1-${LIMITS.options}`);
      for (const o of opts) {
        if (!isObj(o) || typeof o.id !== "string" || typeof o.label !== "string" || typeof o.next !== "string") { n("option needs string id, label, next"); continue; }
        if (!ID.test(o.id)) n(`option id "${o.id}" has invalid characters`);
        if (optIds.has(o.id)) n(`duplicate option id "${o.id}"`);
        optIds.add(o.id);
        if (!o.label.trim() || o.label.length > LIMITS.labelChars) n(`option "${o.id}" label empty or over ${LIMITS.labelChars} chars`);
        const b = hasBanned(o.label); if (b) n(`banned word in option "${o.id}": ${b}`);
        if (!(o.next in nodes)) n(`option "${o.id}" points to missing node "${o.next}"`);
      }
    }
  }
  // reachability + no dead ends are checked on what parsed so far
  if (typeof t.start === "string" && t.start in nodes && errs.length === 0) {
    const seen = new Set<string>(); const stack = [t.start];
    while (stack.length) {
      const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id);
      for (const o of (nodes[id] as SimNode).options ?? []) stack.push(o.next);
    }
    for (const nid of names) if (!seen.has(nid)) e(`node ${nid} is unreachable from start`);
    if (![...seen].some((id) => (nodes[id] as SimNode).end)) e("no end node is reachable");
  }
  return errs;
}

/** Check a whole set: every thread valid, thread ids unique, chain targets exist. */
export function validateAll(threads: unknown[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const t of threads) {
    errs.push(...validateThread(t));
    const id = isObj(t) && typeof t.id === "string" ? t.id : null;
    if (id) { if (ids.has(id)) errs.push(`${id}: duplicate thread id`); ids.add(id); }
  }
  for (const t of threads) {
    if (!isObj(t) || !isObj(t.nodes)) continue;
    for (const [nid, n] of Object.entries(t.nodes)) {
      const c = isObj(n) ? n.chain : undefined;
      if (typeof c === "string" && c !== "random" && !ids.has(c)) errs.push(`${String(t.id)}: node ${nid} chains to unknown thread "${c}"`);
    }
  }
  return errs;
}
