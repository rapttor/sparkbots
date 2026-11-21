import type { Activity, AgentEvent } from "../types.js";
import { parseLine as parseClaudeLine, toolActivity as claudeToolActivity, type ParsedLine } from "../claude-code/parse.js";

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** OpenCode tool ids mapped onto the activity labels the office already uses. */
export function toolActivity(tool: string, target?: string): Activity {
  const t = tool.toLowerCase();
  if (t === "bash" || t === "shell" || t === "terminal") return claudeToolActivity("Bash", { command: target ?? "" });
  if (t === "read" || t === "grep" || t === "glob" || t === "list" || t === "search" || t === "webfetch" || t === "websearch") return "researching";
  if (t === "edit" || t === "write" || t === "patch" || t === "multiedit") return "coding";
  if (t === "task" || t === "agent") return "delegating";
  if (t === "todowrite" || t === "todoread" || t === "plan") return "planning";
  return "running";
}

/**
 * Cache records are written by `discover.ts`: text turns use the Claude Code JSONL shape (so the existing
 * transcript/search readers reuse them), while tool/usage/turn events are small OpenCode-specific records.
 */
export function parseLine(line: string): ParsedLine {
  let o: any;
  try { o = JSON.parse(line); } catch { return { events: [], ok: false }; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { events: [], ok: false };
  const session = str(o.sessionId) ?? "";
  const parsed = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
  const at = Number.isNaN(parsed) ? Date.now() : parsed;

  if (o.type === "opencode_tool") {
    return { events: [{ kind: "tool", session, tool: str(o.tool) ?? "tool", target: str(o.target), at }], ok: true };
  }
  if (o.type === "opencode_usage") {
    return { events: [{ kind: "usage", session, model: str(o.model) ?? "opencode", input: num(o.input), output: num(o.output), cacheRead: num(o.cacheRead), cacheWrite: num(o.cacheWrite), at }], ok: true };
  }
  if (o.type === "opencode_turn_end") return { events: [{ kind: "turn_end", session, at }], ok: true };
  if (o.type === "opencode_error") return { events: [{ kind: "error", session, message: str(o.message) ?? "OpenCode error", at }], ok: true };

  const p = parseClaudeLine(line);
  if (o.error && typeof o.error === "object") {
    p.events.push({ kind: "error", session, message: str(o.error?.data?.message) ?? str(o.error?.name) ?? "OpenCode error", at });
  }
  return p;
}
