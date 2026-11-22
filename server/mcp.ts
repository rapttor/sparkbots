import { readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * MCP servers configured per project (task 10.6). READ-ONLY: this only parses config files, it never
 * starts, stops or contacts a server. Secrets are never returned: env and header values are dropped
 * (keys only), URL credentials/query strings are stripped, and secret-looking args are masked.
 * Every shape below is [VERIFY]: Claude Code's config files are not a public API, so unknown shapes are ignored.
 */
export type McpScope = "project" | "local" | "user" | "settings";
export interface McpServer {
  name: string;
  scope: McpScope;
  /** Where it was read from. */
  source: string;
  type: "stdio" | "http" | "sse" | "unknown";
  command?: string;
  args?: string[];
  url?: string;
  envKeys: string[];
  headerKeys: string[];
  /** false when .claude/settings*.json lists it in disabledMcpjsonServers [VERIFY]. */
  disabled: boolean;
}
export interface McpProject { project: string; servers: McpServer[] }

const SECRET = /key|token|secret|pass|auth|cred|bearer/i;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function readJson(file: string): unknown {
  try { if (statSync(file).size > 5_000_000) return undefined; return JSON.parse(readFileSync(file, "utf8")); } catch { return undefined; }
}

/** Drops credentials and the query string (tokens often ride there) from a URL; leaves non-URLs alone. */
export function safeUrl(u: string): string {
  try { const x = new URL(u); x.username = ""; x.password = ""; x.search = ""; x.hash = ""; return x.toString(); } catch { return u.slice(0, 200); }
}

/** Masks values of secret-looking flags: `--token=abc`, `--token abc`. */
export function safeArgs(args: unknown[]): string[] {
  const out: string[] = []; let maskNext = false;
  for (const a of args) {
    if (typeof a !== "string") continue;
    if (maskNext) { out.push("***"); maskNext = false; continue; }
    const eq = a.indexOf("=");
    if (a.startsWith("-") && eq > 0 && SECRET.test(a.slice(0, eq))) { out.push(`${a.slice(0, eq)}=***`); continue; }
    if (a.startsWith("-") && eq < 0 && SECRET.test(a)) { maskNext = true; out.push(a); continue; }
    out.push(a.length > 200 ? `${a.slice(0, 200)}…` : a);
  }
  return out;
}

/** One `mcpServers` object → servers. Entries that are not objects are skipped. */
export function parseServers(raw: unknown, scope: McpScope, source: string, disabled: Set<string> = new Set()): McpServer[] {
  if (!isObj(raw)) return [];
  const out: McpServer[] = [];
  for (const [name, v] of Object.entries(raw)) {
    if (!isObj(v)) continue;
    const t = typeof v.type === "string" ? v.type : undefined;
    const url = typeof v.url === "string" ? safeUrl(v.url) : undefined;
    const command = typeof v.command === "string" ? v.command.slice(0, 300) : undefined;
    const type: McpServer["type"] = t === "http" || t === "sse" || t === "stdio" ? t : command ? "stdio" : url ? "http" : "unknown";
    out.push({
      name, scope, source, type, command, url,
      args: Array.isArray(v.args) ? safeArgs(v.args) : undefined,
      envKeys: isObj(v.env) ? Object.keys(v.env) : [],
      headerKeys: isObj(v.headers) ? Object.keys(v.headers) : [],
      disabled: disabled.has(name),
    });
  }
  return out;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Servers for one project dir: .mcp.json, .claude/settings*.json, then ~/.claude.json's per-project entry. */
export function projectServers(cwd: string, claudeJson: unknown): McpServer[] {
  const settings = [".claude/settings.json", ".claude/settings.local.json"].map((f) => ({ f, j: readJson(path.join(cwd, f)) })).filter((x) => isObj(x.j));
  const disabled = new Set<string>(settings.flatMap((s) => strList((s.j as Record<string, unknown>).disabledMcpjsonServers))); // [VERIFY]
  const out: McpServer[] = [];
  const mcpJson = readJson(path.join(cwd, ".mcp.json"));
  if (isObj(mcpJson)) out.push(...parseServers(mcpJson.mcpServers, "project", ".mcp.json", disabled)); // [VERIFY] { mcpServers: {...} }
  for (const s of settings) out.push(...parseServers((s.j as Record<string, unknown>).mcpServers, "settings", s.f)); // [VERIFY] rarely present here
  if (isObj(claudeJson) && isObj(claudeJson.projects)) {
    const p = claudeJson.projects[cwd]; // [VERIFY] keyed by absolute path
    if (isObj(p)) out.push(...parseServers(p.mcpServers, "local", "~/.claude.json"));
  }
  return out;
}

/** Everything configured, grouped by project. User-level servers (top-level in ~/.claude.json) go under project "" . */
export function listMcp(cwds: Iterable<string>, home = os.homedir()): McpProject[] {
  const claudeJson = readJson(path.join(home, ".claude.json"));
  const dirs = new Set<string>(cwds);
  if (isObj(claudeJson) && isObj(claudeJson.projects)) for (const k of Object.keys(claudeJson.projects)) if (path.isAbsolute(k)) dirs.add(k);
  const out: McpProject[] = [];
  if (isObj(claudeJson)) { const u = parseServers(claudeJson.mcpServers, "user", "~/.claude.json"); if (u.length) out.push({ project: "", servers: u }); }
  for (const d of [...dirs].sort()) { const servers = projectServers(d, claudeJson); if (servers.length) out.push({ project: d, servers }); }
  return out;
}
