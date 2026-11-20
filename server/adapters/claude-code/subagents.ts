import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SubagentInfo {
  id: string;
  type: string;          // agentType, e.g. general-purpose
  description: string;
  model?: string;
  finished: boolean;
  mtimeMs: number;       // last activity of its transcript
}

/** Sub-agents a session started: `<session>/subagents/agent-*.meta.json` next to the session's .jsonl. [VERIFY] format on upgrade. */
export function listSubagents(sessionFile: string): SubagentInfo[] {
  const dir = join(sessionFile.replace(/\.jsonl$/, ""), "subagents");
  let names: string[];
  try { names = readdirSync(dir); } catch { return []; }
  const out: SubagentInfo[] = [];
  for (const n of names) {
    const m = /^agent-(.+)\.meta\.json$/.exec(n);
    if (!m) continue;
    try {
      const meta = JSON.parse(readFileSync(join(dir, n), "utf8")) as Record<string, unknown>;
      let mtimeMs = 0;
      try { mtimeMs = statSync(join(dir, `agent-${m[1]}.jsonl`)).mtimeMs; } catch { try { mtimeMs = statSync(join(dir, n)).mtimeMs; } catch { /* gone */ } }
      out.push({
        id: m[1]!, type: typeof meta.agentType === "string" ? meta.agentType : "agent",
        description: typeof meta.description === "string" ? meta.description.slice(0, 120) : "",
        model: typeof meta.model === "string" ? meta.model : undefined, finished: meta.finished === true, mtimeMs,
      });
    } catch { /* unreadable meta: skip */ }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
