import { randomUUID } from "node:crypto";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { aoHome, loadJson, saveJson as writeJson } from "../config";
import { parseServiceUrl } from "./probe";
import { SERVICE_KINDS, type Service, type ServiceKind } from "./types";

interface ServicesFile { schemaVersion: 1; services: Service[] }
export const MAX_SERVICES = 40;
export type PublicService = Omit<Service, "token"> & { hasToken: boolean };
export interface ServiceInput { name?: unknown; url?: unknown; kind?: unknown; token?: unknown; source?: "scan" | "manual" }

/** services.json can hold access tokens: keep it readable by you only. */
function saveJson(name: string, data: object): void {
  writeJson(name, data);
  try { chmodSync(join(aoHome(), name), 0o600); } catch { /* best effort (e.g. Windows) */ }
}

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const normUrl = (u: URL) => u.origin + u.pathname.replace(/\/+$/, "");

/** The token never leaves the server: clients only learn whether one is set. */
export function publicView(svc: Service): PublicService {
  const { token, ...rest } = svc;
  return { ...rest, hasToken: !!token };
}

export class ServiceRegistry {
  private load = () => loadJson<ServicesFile>("services.json", { schemaVersion: 1, services: [] });

  list(): Service[] { return this.load().services; }
  get(id: string): Service | undefined { return this.list().find((s) => s.id === id); }

  add(input: ServiceInput): Service {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 60) throw fail("name is required (60 characters max)");
    const u = parseServiceUrl(typeof input.url === "string" ? input.url.trim() : "");
    if (typeof u === "string") throw fail(u);
    if (!SERVICE_KINDS.includes(input.kind as ServiceKind)) throw fail("unknown kind");
    const file = this.load();
    if (file.services.length >= MAX_SERVICES) throw fail(`at most ${MAX_SERVICES} services`);
    const url = normUrl(u);
    if (file.services.some((s) => normUrl(new URL(s.url)) === url)) throw fail("this url is already registered", 409);
    const token = typeof input.token === "string" && input.token ? input.token : undefined;
    const svc: Service = {
      id: `${input.kind as string}-${randomUUID().slice(0, 8)}`, kind: input.kind as ServiceKind, name, url,
      source: input.source ?? "manual", addedAt: Date.now(), ...(token ? { token } : {}),
    };
    file.services.push(svc);
    saveJson("services.json", file);
    return svc;
  }

  remove(id: string): boolean {
    const file = this.load();
    const before = file.services.length;
    file.services = file.services.filter((s) => s.id !== id);
    if (file.services.length === before) return false;
    saveJson("services.json", file);
    return true;
  }
}
