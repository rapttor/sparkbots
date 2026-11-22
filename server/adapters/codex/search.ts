import { isInternal } from "./parse";

/**
 * Text of one Codex rollout record for the data-room index. Only `response_item` messages count: the live
 * `item_completed` events repeat the same assistant text, which would index every reply twice.
 */
export function codexMessageOf(line: string): { at: number; role: "user" | "assistant"; text: string } | null {
  let o: any;
  try { o = JSON.parse(line); } catch { return null; }
  const p = o?.payload;
  if (o?.type !== "response_item" || p?.type !== "message" || (p.role !== "user" && p.role !== "assistant") || !Array.isArray(p.content)) return null;
  const text = p.content.filter((b: any) => b && (b.type === "input_text" || b.type === "output_text") && typeof b.text === "string").map((b: any) => b.text as string).join("\n").trim();
  if (!text || isInternal(text)) return null;
  const at = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : 0;
  return { at: Number.isFinite(at) ? at : 0, role: p.role, text: text.slice(0, 20_000) };
}
