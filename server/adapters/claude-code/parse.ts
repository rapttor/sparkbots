import type { Activity, AgentEvent } from "../types.js";

const TEST_RE = /(vitest|jest|pytest|phpunit|npm (run )?test|pnpm test|go test)/;
const SHIP_RE = /git push|deploy/;

export function toolActivity(tool: string, input?: any): Activity {
  switch (tool) {
    case "Read": case "Grep": case "Glob": case "WebSearch": case "WebFetch":
      return "researching";
    case "Edit": case "Write": case "NotebookEdit":
      return "coding";
    case "Bash": {
      const cmd = typeof input?.command === "string" ? input.command : "";
      if (TEST_RE.test(cmd)) return "testing";
      if (SHIP_RE.test(cmd)) return "shipping";
      return "running";
    }
    case "Agent": case "Task":
      return "delegating";
    case "TodoWrite": case "ExitPlanMode": case "EnterPlanMode":
      return "planning";
    default:
      return "running";
  }
}

export interface ParsedLine {
  events: AgentEvent[];
  ok: boolean;
  cwd?: string;
  sessionId?: string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function toolTarget(input: any): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  return (
    str(input.file_path) ?? str(input.path) ?? str(input.pattern) ??
    (str(input.command)?.slice(0, 80)) ?? str(input.description)
  );
}

export function parseLine(line: string): ParsedLine {
  let obj: any;
  try { obj = JSON.parse(line); } catch { return { events: [], ok: false }; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { events: [], ok: false };

  const session: string = str(obj.sessionId) ?? "";
  const parsedAt = typeof obj.timestamp === "string" ? Date.parse(obj.timestamp) : NaN;
  const at = Number.isNaN(parsedAt) ? Date.now() : parsedAt;
  const events: AgentEvent[] = [];
  const msg = obj.message && typeof obj.message === "object" ? obj.message : undefined;

  if (obj.type === "user" && msg) {
    const text = userText(msg.content);
    if (text !== undefined) {
      events.push({ kind: "turn_start", session, at });
      events.push({ kind: "message", session, role: "user", preview: text.slice(0, 120), at });
    }
  } else if (obj.type === "assistant" && msg) {
    const u = msg.usage;
    if (u && typeof u === "object") {
      events.push({
        kind: "usage", session, model: str(msg.model) ?? "unknown",
        input: num(u.input_tokens), output: num(u.output_tokens),
        cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens), at,
      });
    }
    if (Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (!b || typeof b !== "object") continue;
        if (b.type === "text" && typeof b.text === "string") {
          events.push({ kind: "message", session, role: "assistant", preview: b.text.slice(0, 1500), at });
        } else if (b.type === "tool_use" && typeof b.name === "string") {
          events.push({ kind: "tool", session, tool: b.name, target: toolTarget(b.input), at });
          if ((b.name === "Agent" || b.name === "Task") && typeof b.id === "string") {
            events.push({ kind: "subagent", session, childId: b.id, state: "start", at });
          }
        }
      }
    }
    if (msg.stop_reason === "end_turn") events.push({ kind: "turn_end", session, at });
  }

  return { events, ok: true, cwd: str(obj.cwd), sessionId: str(obj.sessionId) };
}

/** Returns plain user text (string or text blocks), or undefined if only tool results / nothing. */
function userText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text as string);
    return texts.length ? texts.join("\n") : undefined;
  }
  return undefined;
}

export function titleFromRecord(obj: any): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  if (obj.type === "custom-title") return str(obj.customTitle)?.slice(0, 60);
  if (obj.type === "user" && obj.message) {
    const t = userText(obj.message.content)?.trimStart();
    if (!t || t.startsWith("<")) return undefined;
    return t.trim().slice(0, 60) || undefined;
  }
  return undefined;
}
