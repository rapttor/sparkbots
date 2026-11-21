import { open, stat } from "node:fs/promises";
import type { ChatMessage } from "../claude-code/transcript";
import { isInternal } from "./parse";

const TAIL_BYTES = 256 * 1024, MAX_TEXT = 1500;

export async function recentMessages(file: string, max = 30): Promise<ChatMessage[]> {
  const size = (await stat(file)).size, start = Math.max(0, size - TAIL_BYTES), fh = await open(file, "r"); let raw = "";
  try { const b = Buffer.alloc(size - start); await fh.read(b, 0, b.length, start); raw = b.toString("utf8"); } finally { await fh.close(); }
  const lines = raw.split("\n"); if (start) lines.shift(); const out: ChatMessage[] = [];
  for (const line of lines) {
    let o: any; try { o = JSON.parse(line); } catch { continue; }
    const p = o?.payload;
    if (o?.type !== "response_item" || p?.type !== "message" || (p.role !== "user" && p.role !== "assistant") || !Array.isArray(p.content)) continue;
    const text = p.content.filter((b: any) => b && (b.type === "input_text" || b.type === "output_text") && typeof b.text === "string").map((b: any) => b.text).join("\n").trim();
    if (!text || isInternal(text)) continue;
    const at = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : 0;
    out.push({ role: p.role, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text, at: Number.isNaN(at) ? 0 : at });
  }
  return out.slice(-max);
}
