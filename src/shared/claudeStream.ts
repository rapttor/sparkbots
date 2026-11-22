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
