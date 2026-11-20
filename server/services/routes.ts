import type { FastifyInstance } from "fastify";
import { probeService, type ProbeFn } from "./probe";
import { publicView, ServiceRegistry } from "./registry";
import { scanLocal, scanProcesses, scanRange, type Candidate } from "./scan";
import type { ServiceStatus } from "./types";

const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

export function registerServices(app: FastifyInstance, changed: () => void, deps: { fetchImpl?: typeof fetch } = {}): ServiceRegistry {
  const registry = new ServiceRegistry();
  const statuses = new Map<string, ServiceStatus>();
  let lastScan = new Map<string, Candidate>();
  const probe: ProbeFn = (svc, _f, ms) => probeService(svc, deps.fetchImpl, ms);

  const view = (id: string) => { const s = registry.get(id); return s ? { ...publicView(s), status: statuses.get(id) } : undefined; };

  app.get("/api/services", async () => registry.list().map((s) => ({ ...publicView(s), status: statuses.get(s.id) })));

  app.post<{ Body: { name?: string; url?: string; kind?: string; token?: string } }>("/api/services", async (req) => {
    const svc = registry.add({ ...(req.body ?? {}), source: "manual" });
    changed();
    return view(svc.id);
  });

  app.delete<{ Params: { id: string } }>("/api/services/:id", async (req) => {
    if (!registry.remove(req.params.id)) throw fail("no such service", 404);
    statuses.delete(req.params.id);
    changed();
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/services/:id/test", async (req) => {
    const svc = registry.get(req.params.id);
    if (!svc) throw fail("no such service", 404);
    const status: ServiceStatus = { id: svc.id, ...(await probe(svc)) };
    statuses.set(svc.id, status);
    changed();
    return status;
  });

  app.post<{ Body: { range?: string; port?: number } | undefined }>("/api/services/scan", async (req) => {
    const { range, port } = req.body ?? {};
    let candidates: Candidate[];
    let processes: { name: string; pid: number }[] = [];
    if (range !== undefined) {
      try { candidates = await scanRange(String(range), Number(port), probe); }
      catch (e) { throw fail((e as Error).message, 400); }
    } else {
      [candidates, processes] = await Promise.all([scanLocal(probe), scanProcesses()]);
    }
    lastScan = new Map(candidates.map((c) => [c.id, c]));
    const known = new Set(registry.list().map((s) => s.url));
    return { candidates: candidates.map((c) => ({ ...publicView(c), status: c.status, registered: known.has(c.url) })), processes };
  });

  app.post<{ Body: { ids?: string[] } }>("/api/services/adopt", async (req) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids)) throw fail("ids required", 400);
    const known = new Set(registry.list().map((s) => s.url));
    const added = [];
    for (const id of ids) {
      const c = lastScan.get(String(id));
      if (!c || known.has(c.url)) continue;
      const svc = registry.add({ name: c.name, url: c.url, kind: c.kind, source: "scan" });
      statuses.set(svc.id, { id: svc.id, ...c.status });
      added.push(view(svc.id));
    }
    if (added.length) changed();
    return added;
  });

  return registry;
}
