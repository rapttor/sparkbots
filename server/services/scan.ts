import { execFile } from "node:child_process";
import { probeService, type ProbeFn, type ProbeResult } from "./probe";
import type { Service, ServiceKind } from "./types";

export const WELL_KNOWN: { kind: ServiceKind; port: number; name: string }[] = [
  { kind: "ollama", port: 11434, name: "Ollama" },
  { kind: "lmstudio", port: 1234, name: "LM Studio" },
  { kind: "llamacpp", port: 8080, name: "llama.cpp server" },
  { kind: "opencode", port: 4096, name: "OpenCode" },
];

export interface Candidate extends Service { status: ProbeResult }

const candidate = (kind: ServiceKind, name: string, host: string, port: number, id: string, status: ProbeResult): Candidate =>
  ({ id, kind, name, url: `http://${host}:${port}`, source: "scan", addedAt: Date.now(), status });

/** Probe 127.0.0.1 on every well-known port, in parallel. Only services that answer are returned. */
export async function scanLocal(probe: ProbeFn = probeService, fetchImpl?: typeof fetch): Promise<Candidate[]> {
  const found = await Promise.all(WELL_KNOWN.map(async (w) => {
    const url = `http://127.0.0.1:${w.port}`;
    const status = await probe({ kind: w.kind, url }, fetchImpl, 600);
    return status.up ? candidate(w.kind, w.name, "127.0.0.1", w.port, `${w.kind}-${w.port}`, status) : undefined;
  }));
  return found.filter((x): x is Candidate => !!x);
}

const PROCESS_PATTERN = /^(ollama|llama-server|lm studio|lmstudio|opencode|codex|gemini)(?![\w-])/;

/** Parse `ps -axo pid=,comm=` output; keep processes whose executable name matches a known AI tool. */
export function parseProcesses(out: string): { name: string; pid: number }[] {
  const found: { name: string; pid: number }[] = [];
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const base = (m[2] ?? "").split("/").pop()?.toLowerCase() ?? "";
    const hit = PROCESS_PATTERN.exec(base);
    if (hit) found.push({ name: hit[1] === "lmstudio" ? "lm studio" : hit[1]!, pid: Number(m[1]) });
  }
  return found;
}

const runPs = (): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile("ps", ["-axo", "pid=,comm="], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

export async function scanProcesses(run: () => Promise<string> = runPs): Promise<{ name: string; pid: number }[]> {
  try { return parseProcesses(await run()); } catch { return []; }
}

const octet = (s: string): number => (/^\d{1,3}$/.test(s) && Number(s) <= 255 ? Number(s) : NaN);

function isPrivate(a: number, b: number): boolean {
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Expand a private CIDR (prefix 24..30) into host addresses. Throws a clear Error for anything else. */
export function expandRange(cidr: string): string[] {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(String(cidr).trim());
  if (!m) throw new Error("range must look like 192.168.1.0/24");
  const [a, b, c, d] = [octet(m[1]!), octet(m[2]!), octet(m[3]!), octet(m[4]!)];
  const prefix = Number(m[5]);
  if ([a, b, c, d].some(Number.isNaN)) throw new Error("range has an invalid address");
  if (!isPrivate(a, b)) throw new Error("only private ranges (10.x, 172.16-31.x, 192.168.x) can be scanned");
  if (prefix < 24) throw new Error("range too large: at most a /24 (254 hosts)");
  if (prefix > 30) throw new Error("range too small: use a prefix between /24 and /30");
  const size = 2 ** (32 - prefix);
  const base = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  const start = base - (base % size);
  const hosts: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    const n = start + i;
    hosts.push(`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
  }
  return hosts;
}

/** Scan an explicit private range on one port. Only call this for an explicit user request. */
export async function scanRange(cidr: string, port: number, probe: ProbeFn = probeService, fetchImpl?: typeof fetch): Promise<Candidate[]> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("port must be 1-65535");
  const hosts = expandRange(cidr);
  const known = WELL_KNOWN.find((w) => w.port === port);
  const kind: ServiceKind = known?.kind ?? "other";
  const found: Candidate[] = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const host = hosts[next++]!;
      const status = await probe({ kind, url: `http://${host}:${port}` }, fetchImpl, 400);
      if (status.up) found.push(candidate(kind, `${known?.name ?? "Service"} @ ${host}`, host, port, `${kind}-${host}-${port}`, status));
    }
  };
  await Promise.all(Array.from({ length: Math.min(32, hosts.length) }, worker));
  return found.sort((x, y) => x.url.localeCompare(y.url, undefined, { numeric: true }));
}
