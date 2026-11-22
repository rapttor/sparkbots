import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { aoHome } from "./config";
import { imageType } from "../src/shared/attachments";

/**
 * Files attached to a chat message. They are saved inside ~/.agent-office/uploads/<id>/ (SparkBots' own folder) and the
 * agent is told where they are; the run gets that folder through --add-dir so Claude can read them. Nothing is executed.
 */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES = 8;
const ID = /^[0-9a-f-]{36}$/;

export const uploadRoot = () => join(aoHome(), "uploads");

/** A safe file name: no path parts, only plain characters, not empty, not hidden. */
export function safeName(raw: unknown): string {
  const base = basename(String(raw ?? "")).replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").trim().slice(0, 100);
  return base || "file";
}

const bad = (m: string, code = 400) => Object.assign(new Error(m), { statusCode: code });

export function registerUploads(app: FastifyInstance): void {
  app.post<{ Body: { name?: unknown; data?: unknown } }>("/api/uploads", { bodyLimit: Math.ceil(MAX_FILE_BYTES * 1.4) + 4096 }, async (req) => {
    const { name, data } = req.body ?? {};
    if (typeof data !== "string" || !data) throw bad("data (base64) required");
    if (data.length > Math.ceil(MAX_FILE_BYTES * 1.4)) throw bad(`file is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`, 413);
    const buf = Buffer.from(data, "base64");
    if (buf.length === 0 || buf.length > MAX_FILE_BYTES) throw bad(`file is empty or larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`, 413);
    const id = randomUUID(), clean = safeName(name), dir = join(uploadRoot(), id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, clean), buf, { mode: 0o600 });
    return { id, name: clean, size: buf.length };
  });
  /** An uploaded image, for previews in the chat. Only png/jpeg/gif/webp, only inside the uploads folder (id is a UUID). */
  app.get<{ Params: { id: string } }>("/api/uploads/:id/file", async (req, reply) => {
    if (!ID.test(req.params.id)) throw bad("bad id");
    const dir = join(uploadRoot(), req.params.id);
    const names = existsSync(dir) ? readdirSync(dir) : [];
    const type = names.length === 1 ? imageType(names[0]!) : null;
    if (!type) throw bad("not an image", 404);
    return reply.header("content-type", type).header("cache-control", "private, max-age=3600").header("x-content-type-options", "nosniff").send(createReadStream(join(dir, names[0]!)));
  });
}

/** Turns the upload ids of a message into file paths and the folders the run must be allowed to read. Throws on anything odd. */
export function resolveAttachments(ids: unknown): { files: { path: string; name: string }[]; dirs: string[] } {
  if (ids === undefined || ids === null) return { files: [], dirs: [] };
  if (!Array.isArray(ids) || ids.length > MAX_FILES || !ids.every((i) => typeof i === "string" && ID.test(i))) throw bad(`attachments must be at most ${MAX_FILES} upload ids`);
  const files: { path: string; name: string }[] = [], dirs: string[] = [];
  for (const id of ids as string[]) {
    const dir = join(uploadRoot(), id);
    if (!existsSync(dir)) throw bad("an attached file is no longer there; attach it again");
    const names = readdirSync(dir);
    if (names.length !== 1) throw bad("unexpected upload folder");
    files.push({ path: join(dir, names[0]!), name: names[0]! }); dirs.push(dir);
  }
  return { files, dirs };
}

/** The prompt plus a list of where the attached files are. Names are plain (see safeName), so the list cannot inject instructions. */
export function withAttachments(prompt: string, files: { path: string; name: string }[]): string {
  if (!files.length) return prompt;
  return `${prompt}\n\nAttached files (read them when needed):\n${files.map((f) => `- ${f.path}`).join("\n")}`;
}

/** Remove uploads older than `days` (called at start). */
export function cleanOldUploads(days = 14): number {
  let n = 0;
  try {
    for (const id of readdirSync(uploadRoot())) {
      const p = join(uploadRoot(), id);
      if (ID.test(id) && Date.now() - statSync(p).mtimeMs > days * 86_400_000) { rmSync(p, { recursive: true, force: true }); n++; }
    }
  } catch { /* no uploads yet */ }
  return n;
}
