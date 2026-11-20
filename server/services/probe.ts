import type { Service, ServiceStatus } from "./types";

export type ProbeTarget = Pick<Service, "kind" | "url" | "token">;
export type ProbeResult = Omit<ServiceStatus, "id">;
export type ProbeFn = (svc: ProbeTarget, fetchImpl?: typeof fetch, timeoutMs?: number) => Promise<ProbeResult>;

const MAX_BODY = 256 * 1024;
const BLOCKED_HOSTS = new Set(["169.254.169.254", "[fd00:ec2::254]", "metadata.google.internal"]);

/** Parse a service URL; returns the URL or an error string. Only http/https, never the cloud-metadata address. */
export function parseServiceUrl(raw: string): URL | string {
  let u: URL;
  try { u = new URL(raw); } catch { return "invalid url"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "only http and https urls are allowed";
  if (BLOCKED_HOSTS.has(u.hostname.toLowerCase())) return "this address is blocked";
  return u;
}

interface Part { ok: boolean; status: number; body: unknown; ms: number }

/** Read at most MAX_BODY bytes of a response and parse JSON; anything unparseable gives undefined. */
async function readJson(res: Response): Promise<unknown> {
  try {
    const reader = res.body?.getReader();
    if (!reader) return JSON.parse((await res.text()).slice(0, MAX_BODY));
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BODY) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    void reader.cancel().catch(() => {});
    return JSON.parse(Buffer.concat(chunks).subarray(0, MAX_BODY).toString("utf8"));
  } catch { return undefined; }
}

/** One GET with timeout. Throws only plain, token-free Errors ("timeout" / "unreachable"). */
async function get(base: string, path: string, token: string | undefined, f: typeof fetch, timeoutMs: number): Promise<Part> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const started = Date.now();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await f(base + path, { method: "GET", headers, signal: ctl.signal, redirect: "manual" });
    const body = await readJson(res);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body, ms: Date.now() - started };
  } catch {
    throw new Error(ctl.signal.aborted ? "timeout" : "unreachable");
  } finally { clearTimeout(timer); }
}

const attempt = (...a: Parameters<typeof get>): Promise<Part | undefined> => get(...a).catch(() => undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const strings = (list: unknown, key: string): string[] | undefined => {
  if (!Array.isArray(list)) return undefined;
  const out = list.map((x) => obj(x)[key]).filter((x): x is string => typeof x === "string").slice(0, 200);
  return out;
};

async function probeOllama(base: string, t: string | undefined, f: typeof fetch, ms: number): Promise<ProbeResult> {
  const v = await get(base, "/api/version", t, f, ms);
  const [tags, ps] = await Promise.all([attempt(base, "/api/tags", t, f, ms), attempt(base, "/api/ps", t, f, ms)]);
  const version = obj(v.body).version;
  return {
    up: v.ok, latencyMs: v.ms, checkedAt: Date.now(),
    version: typeof version === "string" ? version : undefined,
    models: tags?.ok ? strings(obj(tags.body).models, "name") : undefined,
    loaded: ps?.ok ? strings(obj(ps.body).models, "name") : undefined,
    error: v.ok ? undefined : `http ${v.status}`,
  };
}

async function probeOpenAi(base: string, t: string | undefined, f: typeof fetch, ms: number, health: boolean): Promise<ProbeResult> {
  const h = health ? await attempt(base, "/health", t, f, ms) : undefined;
  const m = await attempt(base, "/v1/models", t, f, ms);
  const up = health ? !!(h?.ok || m?.ok) : !!m?.ok;
  const first = h ?? m;
  return {
    up, latencyMs: first?.ms, checkedAt: Date.now(),
    models: m?.ok ? strings(obj(m.body).data, "id") : undefined,
    error: up ? undefined : first ? `http ${first.status}` : "unreachable",
  };
}

async function probeReachable(base: string, t: string | undefined, f: typeof fetch, ms: number): Promise<ProbeResult> {
  const r = await get(base, "/", t, f, ms);
  const up = r.status < 500;
  return { up, latencyMs: r.ms, checkedAt: Date.now(), error: up ? undefined : `http ${r.status}` };
}

export const probeService: ProbeFn = async (svc, fetchImpl = fetch, timeoutMs = 1500) => {
  const u = parseServiceUrl(svc.url);
  if (typeof u === "string") return { up: false, error: u, checkedAt: Date.now() };
  const base = u.origin + u.pathname.replace(/\/+$/, "");
  try {
    switch (svc.kind) {
      case "ollama": return await probeOllama(base, svc.token, fetchImpl, timeoutMs);
      case "lmstudio":
      case "openai-compatible": return await probeOpenAi(base, svc.token, fetchImpl, timeoutMs, false);
      case "llamacpp": return await probeOpenAi(base, svc.token, fetchImpl, timeoutMs, true);
      default: return await probeReachable(base, svc.token, fetchImpl, timeoutMs);
    }
  } catch (e) {
    const msg = e instanceof Error && e.message === "timeout" ? "timeout" : "unreachable";
    return { up: false, error: msg, checkedAt: Date.now() };
  }
};
