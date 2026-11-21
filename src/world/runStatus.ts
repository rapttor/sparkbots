/** What went wrong with the latest run, read from its stream-json lines. Pure: easy to test. */
export interface RunProblem { level: "retry" | "error"; text: string; kind?: "model" } // kind "model": the endpoint does not know the chosen model

const label = (status: unknown, error: unknown): string => {
  if (status === 401) return "Authentication failed (401): sign in again or check the API credentials";
  if (status === 403) return "Request refused (403)";
  if (status === 429) return "Usage or rate limit reached (429)";
  if (typeof status === "number" && status >= 500) return `The model service had a problem (${status})`;
  return typeof error === "string" && error ? error.replace(/_/g, " ") : `Request failed${typeof status === "number" ? ` (${status})` : ""}`;
};

export function runProblem(lines: unknown[]): RunProblem | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i] as Record<string, unknown> | null;
    if (!l || typeof l !== "object") continue;
    if (l.type === "assistant" || l.type === "user") return null; // the run moved on after any retry
    if (l.type === "result") {
      if (l.is_error === true || (typeof l.subtype === "string" && l.subtype.startsWith("error"))) {
        const t = typeof l.result === "string" && l.result ? l.result : "The run ended with an error";
        return { level: "error", text: t.length > 300 ? `${t.slice(0, 300)}…` : t, ...(/issue with the selected model|model.{0,40}(not found|does not exist)/i.test(t) ? { kind: "model" as const } : {}) };
      }
      return null;
    }
    if (l.type === "system" && l.subtype === "api_retry") {
      return { level: "retry", text: `${label(l.error_status, l.error)}, retrying ${String(l.attempt)}/${String(l.max_retries)}` };
    }
  }
  return null;
}
