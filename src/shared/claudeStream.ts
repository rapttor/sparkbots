/** Pure helpers for Claude Code's stream-json lines: streamed text, and tool permission denials. Defensive: unknown shapes are ignored. */

export interface PermissionDenial { tool: string; input?: unknown }
/** A synthetic log line holding the reply text streamed so far in the current message. Replaced by the final `assistant` line. */
export interface PartialLine { type: "partial"; text: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The text of a `--include-partial-messages` delta line (`stream_event` / `content_block_delta` / `text_delta`), else null. */
export function textDelta(line: unknown): string | null {
  if (!isObj(line) || line.type !== "stream_event" || !isObj(line.event)) return null;
  const e = line.event;
  if (e.type !== "content_block_delta" || !isObj(e.delta)) return null;
  return e.delta.type === "text_delta" && typeof e.delta.text === "string" && e.delta.text ? e.delta.text : null;
}

/** `stream_event` lines that carry no text we show (message_start, thinking deltas, ...): kept out of the log so it is not flooded. */
export const isStreamEvent = (line: unknown): boolean => isObj(line) && line.type === "stream_event";

/** Add one stream line to a run log in place: text deltas grow one trailing partial line, the final assistant message replaces it. */
export function foldLog(log: unknown[], line: unknown): unknown[] {
  const last = log[log.length - 1];
  const hasPartial = isObj(last) && last.type === "partial";
  const d = textDelta(line);
  if (d !== null) {
    if (hasPartial) log[log.length - 1] = { type: "partial", text: (last as unknown as PartialLine).text + d };
    else log.push({ type: "partial", text: d });
    return log;
  }
  if (isStreamEvent(line)) return log; // other stream events: ignore
  if (hasPartial && isObj(line) && (line.type === "assistant" || line.type === "result" || line.type === "user")) log.pop();
  log.push(line);
  return log;
}

/** The text streamed so far for the turn that is still running, or "" (the log ends with a partial line). */
export function partialText(log: unknown[]): string {
  const last = log[log.length - 1];
  return isObj(last) && last.type === "partial" && typeof last.text === "string" ? last.text : "";
}

/** Tools the run was denied, read from the last `result` record's `permission_denials` (`[{ tool_name, tool_use_id, tool_input }]`). */
export function permissionDenials(log: unknown[]): PermissionDenial[] {
  for (let i = log.length - 1; i >= 0; i--) {
    const l = log[i];
    if (!isObj(l)) continue;
    if (l.type !== "result") { if (l.type === "assistant" || l.type === "user") return []; continue; }
    if (!Array.isArray(l.permission_denials)) return [];
    const out: PermissionDenial[] = [];
    for (const d of l.permission_denials) {
      if (isObj(d) && typeof d.tool_name === "string" && d.tool_name) out.push({ tool: d.tool_name, input: d.tool_input });
    }
    return out;
  }
  return [];
}

/** Tool names safe to pass to `--allowedTools` as one entry (no commas, spaces, parentheses or leading dash). */
export const SAFE_TOOL = /^[A-Za-z0-9_][A-Za-z0-9_.\-]{0,99}$/;

// ---- Live approval (`--permission-prompt-tool stdio`): the CLI asks us through `control_request` lines on stdout ----

export interface ApprovalRequest { requestId: string; tool: string; input: Record<string, unknown>; toolUseId?: string; description?: string }

/** A `can_use_tool` control request (tool permission question) from the CLI, else null. */
export function parseApprovalRequest(line: unknown): ApprovalRequest | null {
  if (!isObj(line) || line.type !== "control_request" || typeof line.request_id !== "string" || !isObj(line.request)) return null;
  const r = line.request;
  if (r.subtype !== "can_use_tool" || typeof r.tool_name !== "string" || !r.tool_name) return null;
  return {
    requestId: line.request_id, tool: r.tool_name, input: isObj(r.input) ? r.input : {},
    ...(typeof r.tool_use_id === "string" ? { toolUseId: r.tool_use_id } : {}),
    ...(typeof r.description === "string" ? { description: r.description.slice(0, 500) } : {}),
  };
}

/** The `control_response` line (without newline) answering a permission question. Allow echoes the original input; deny carries a reason Claude sees. */
export function approvalResponse(requestId: string, allow: boolean, input: Record<string, unknown>, message = "Denied in SparkBots"): string {
  const response = allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message };
  return JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: requestId, response } });
}

/** An error `control_response` for a control request we do not support (so the CLI never waits for us). */
export function unsupportedControlResponse(requestId: string): string {
  return JSON.stringify({ type: "control_response", response: { subtype: "error", request_id: requestId, error: "not supported by SparkBots" } });
}

/** A user message for `--input-format stream-json`. */
export function userMessageLine(prompt: string): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: prompt } });
}

/** Synthetic log lines the server adds so the chat can show a question and know when it was answered. */
export interface ApprovalLine { type: "approval_request"; request_id: string; tool_name: string; input: Record<string, unknown>; description?: string }
export interface ApprovalResolvedLine { type: "approval_resolved"; request_id: string; decision: "allow" | "deny" | "cancelled" }

/** Permission questions in a run log that nobody has answered yet. */
export function pendingApprovals(log: unknown[]): ApprovalLine[] {
  const open = new Map<string, ApprovalLine>();
  for (const l of log) {
    if (!isObj(l)) continue;
    if (l.type === "approval_request" && typeof l.request_id === "string" && typeof l.tool_name === "string") open.set(l.request_id, l as unknown as ApprovalLine);
    else if (l.type === "approval_resolved" && typeof l.request_id === "string") open.delete(l.request_id);
  }
  return [...open.values()];
}

/** A short one-line description of what a tool wants to do (command, file path, URL, ...), for the approval card. */
export function describeToolInput(tool: string, input: unknown): string {
  if (!isObj(input)) return "";
  for (const k of ["command", "file_path", "path", "url", "pattern", "query", "description"]) {
    const v = input[k];
    if (typeof v === "string" && v) return v.length > 300 ? v.slice(0, 297) + "…" : v;
  }
  return tool;
}
