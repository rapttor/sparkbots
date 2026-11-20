import { open, stat } from "node:fs/promises";

export interface ChatMessage { role: "user" | "assistant"; text: string; at: number }

const TAIL_BYTES = 256 * 1024;
const MAX_TEXT = 1500;

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b: any) => b && b.type === "text" && typeof b.text === "string").map((b: any) => b.text as string).join("\n");
};

/** Last `max` real chat turns of a session transcript (user prompts + assistant text; tool calls/results skipped). Read-only. */
export async function recentMessages(file: string, max = 30): Promise<ChatMessage[]> {
  const size = (await stat(file)).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const fh = await open(file, "r");
  let raw: string;
  try {
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    raw = buf.toString("utf8");
  } finally { await fh.close(); }
  const lines = raw.split("\n");
  if (start > 0) lines.shift(); // probably cut mid-line
  const out: ChatMessage[] = [];
  for (const line of lines) {
    if (!line) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || (o.type !== "user" && o.type !== "assistant") || !o.message || o.isMeta || o.isSidechain) continue;
    const text = textOf(o.message.content).trim();
    if (!text || text.startsWith("<")) continue; // system reminders / command wrappers
    const at = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    out.push({ role: o.type, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text, at: Number.isNaN(at) ? 0 : at });
  }
  return out.slice(-max);
}
