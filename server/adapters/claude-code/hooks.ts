import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { aoHome } from "../../config";
import { claudeDir } from "./discover";
import type { AgentEvent } from "../types";

/** [VERIFY] Event names + stdin payload shape checked against Claude Code 2.1.x settings on this machine; re-check on upgrade. */
export const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Notification", "Stop", "SubagentStop", "SessionEnd"] as const;
export const MARKER = "ao=1"; // present in the hook URL; identifies entries we added

type Entry = { matcher?: string; hooks: { type: string; command?: string; args?: string[]; timeout?: number }[] };
export type Settings = { hooks?: Record<string, Entry[]> } & Record<string, unknown>;

export const settingsPath = () => join(claudeDir(), "settings.json");

/** Stable token used only for /hook (so installed hooks survive server restarts). 0600. */
export function hookToken(): string {
  const f = join(aoHome(), "hook-token");
  if (existsSync(f)) return readFileSync(f, "utf8").trim();
  mkdirSync(aoHome(), { recursive: true });
  const t = randomBytes(24).toString("hex");
  writeFileSync(f, t, { mode: 0o600 }); chmodSync(f, 0o600);
  return t;
}

const isOurs = (e: Entry) => e.hooks?.some((h) => h.args?.some((a) => a.includes(MARKER)));

const entry = (port: number, token: string): Entry => ({
  hooks: [{ type: "command", command: "curl", timeout: 3,
    args: ["-s", "-m", "2", "-X", "POST", "-H", "content-type: application/json", "-H", `x-ao-token: ${token}`, "--data-binary", "@-", `http://127.0.0.1:${port}/hook?${MARKER}`] }],
});

export function installInto(s: Settings, port: number, token: string): Settings {
  const out: Settings = structuredClone(s); out.hooks ??= {};
  for (const ev of HOOK_EVENTS) {
    const list = (out.hooks[ev] ??= []).filter((e) => !isOurs(e)); // idempotent
    list.push(entry(port, token)); out.hooks[ev] = list;
  }
  return out;
}

export function uninstallFrom(s: Settings): Settings {
  const out: Settings = structuredClone(s); if (!out.hooks) return out;
  for (const ev of Object.keys(out.hooks)) {
    const kept = out.hooks[ev].filter((e) => !isOurs(e));
    if (kept.length) out.hooks[ev] = kept; else delete out.hooks[ev];
  }
  if (Object.keys(out.hooks).length === 0) delete out.hooks;
  return out;
}

export const isInstalled = (s: Settings) => Object.values(s.hooks ?? {}).some((l) => l.some(isOurs));

/** Tiny line diff (added/removed lines) for the confirmation prompt. */
export function diffText(a: unknown, b: unknown): string {
  const x = JSON.stringify(a, null, 2).split("\n"), y = JSON.stringify(b, null, 2).split("\n");
  const sx = new Set(x), sy = new Set(y);
  return [...x.filter((l) => !sy.has(l)).map((l) => `- ${l}`), ...y.filter((l) => !sx.has(l)).map((l) => `+ ${l}`)].join("\n");
}

export function readSettings(): Settings {
  try { return JSON.parse(readFileSync(settingsPath(), "utf8")); } catch { return {}; }
}

/** Backs up first, then writes. Returns the backup path. */
export function writeSettingsWithBackup(next: Settings): string | undefined {
  const dir = join(aoHome(), "backups"); mkdirSync(dir, { recursive: true });
  let backup: string | undefined;
  if (existsSync(settingsPath())) { backup = join(dir, `settings.${Date.now()}.json`); copyFileSync(settingsPath(), backup); }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2) + "\n");
  return backup;
}

/** Hook payload (stdin JSON from Claude Code) -> events. Unknown shapes -> []. */
export function hookToEvents(p: Record<string, unknown>, now = Date.now()): AgentEvent[] {
  const session = typeof p.session_id === "string" ? p.session_id : ""; if (!session) return [];
  const at = now;
  switch (p.hook_event_name) {
    case "UserPromptSubmit": return [{ kind: "turn_start", session, at }];
    case "PreToolUse": { const i = (p.tool_input ?? {}) as Record<string, unknown>;
      const tool = String(p.tool_name ?? "tool"); const target = String(i.file_path ?? i.path ?? i.pattern ?? i.command ?? "").slice(0, 80) || undefined;
      const ev: AgentEvent[] = [{ kind: "tool", session, tool, target, at }];
      if (tool === "Agent" || tool === "Task") ev.push({ kind: "subagent", session, childId: String(p.tool_use_id ?? at), state: "start", at });
      return ev; }
    case "Notification": return [{ kind: "permission_wait", session, at }];
    case "Stop": return [{ kind: "turn_end", session, at }];
    case "SubagentStop": return [{ kind: "subagent", session, childId: String(p.agent_id ?? ""), state: "end", at }];
    default: return [];
  }
}
