import type { Activity, AgentEvent } from "../types.js";

export interface ParsedLine { events: AgentEvent[]; ok: boolean; cwd?: string; sessionId?: string }

const str = (v: unknown): string | undefined => typeof v === "string" && v ? v : undefined;
const num = (v: unknown): number => typeof v === "number" && Number.isFinite(v) ? v : 0;
const atOf = (o: any): number => {
  const n = typeof o?.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
  return Number.isNaN(n) ? Date.now() : n;
};

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b: any) => b && (b.type === "input_text" || b.type === "output_text") && typeof b.text === "string")
    .map((b: any) => b.text as string).join("\n");
}

function itemText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.filter((b: any) => b && (b.type === "Text" || b.type === "text") && typeof b.text === "string").map((b: any) => b.text as string).join("\n");
}

export function parseLine(line: string): ParsedLine {
  let o: any;
  try { o = JSON.parse(line); } catch { return { events: [], ok: false }; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { events: [], ok: false };
  const p = o.payload && typeof o.payload === "object" ? o.payload : {};
  const session = str(p.session_id) ?? str(p.thread_id) ?? str(p.id) ?? "";
  const at = atOf(o); const events: AgentEvent[] = [];

  if (o.type === "event_msg" && p.type === "task_started") events.push({ kind: "turn_start", session, at });
  if (o.type === "event_msg" && (p.type === "task_complete" || p.type === "turn_aborted")) {
    if (p.type === "turn_aborted") events.push({ kind: "error", session, message: "Turn aborted", at });
    else events.push({ kind: "turn_end", session, at });
  }
  if (o.type === "response_item" && p.type === "message" && (p.role === "user" || p.role === "assistant")) {
    const text = contentText(p.content).trim();
    if (text && !isInternal(text)) events.push({ kind: "message", session, role: p.role, preview: text.slice(0, 1500), at });
  }
  // The app writes this immediately when a visible assistant segment completes, just before the archival
  // response_item record. Consuming it makes the 3D speech bubble track the live chat at the earliest point.
  if (o.type === "event_msg" && p.type === "item_completed" && p.item?.type === "AgentMessage") {
    const text = itemText(p.item.content).trim();
    if (text) events.push({ kind: "message", session, role: "assistant", preview: text.slice(0, 1500), at });
  }
  if (o.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
    const name = str(p.name) ?? "tool";
    events.push({ kind: "tool", session, tool: name, at });
  }
  if (o.type === "token_usage_record" && p.usage) {
    events.push({ kind: "usage", session, model: str(p.model) ?? "codex", input: num(p.usage.input_tokens), output: num(p.usage.output_tokens), cacheRead: num(p.usage.cached_input_tokens), cacheWrite: num(p.usage.cache_write_input_tokens), at });
  }
  return { events, ok: true, cwd: o.type === "session_meta" ? str(p.cwd) : undefined, sessionId: o.type === "session_meta" ? (str(p.session_id) ?? str(p.id)) : undefined };
}

export function toolActivity(tool: string): Activity {
  const t = tool.toLowerCase();
  if (t.includes("search") || t.includes("read") || t.includes("find")) return "researching";
  if (t.includes("patch") || t.includes("write") || t.includes("edit")) return "coding";
  if (t.includes("agent") || t.includes("task")) return "delegating";
  return "running";
}

export function isInternal(text: string): boolean {
  return text.startsWith("<") || text.startsWith("# AGENTS.md instructions") || text.includes("<environment_context>");
}
