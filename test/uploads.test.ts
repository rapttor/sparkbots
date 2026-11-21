import { beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { existsSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArgs } from "../server/adapters/claude-code/command";
import { cleanOldUploads, registerUploads, resolveAttachments, safeName, uploadRoot, withAttachments } from "../server/uploads";

beforeEach(() => { process.env.AO_HOME = mkdtempSync(join(tmpdir(), "ao-")); });

describe("uploads", () => {
  it("cleans file names", () => {
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("..hidden.txt")).toBe("hidden.txt");
    expect(safeName("my report (1).pdf")).toBe("my report (1).pdf");
    expect(safeName("a\nb;rm -rf.txt")).toBe("a_b_rm -rf.txt");
    expect(safeName("")).toBe("file");
  });
  it("stores a file inside the uploads folder and resolves it back, refusing anything else", async () => {
    const app = Fastify(); registerUploads(app); await app.ready();
    const r = await app.inject({ method: "POST", url: "/api/uploads", payload: { name: "../notes.txt", data: Buffer.from("hello").toString("base64") } });
    expect(r.statusCode).toBe(200);
    const { id } = r.json();
    const att = resolveAttachments([id]);
    expect(att.files[0]!.path.startsWith(uploadRoot())).toBe(true);
    expect(att.files[0]!.name).toBe("notes.txt");
    expect(() => resolveAttachments(["../../etc"])).toThrow();
    expect(() => resolveAttachments([123])).toThrow();
    expect(() => resolveAttachments(Array(9).fill(id))).toThrow();
    expect((await app.inject({ method: "POST", url: "/api/uploads", payload: { name: "x" } })).statusCode).toBe(400);
  });
  it("lists the files for the agent and passes the folder to the run", () => {
    const text = withAttachments("look", [{ path: "/a/b.txt", name: "b.txt" }]);
    expect(text).toContain("- /a/b.txt");
    expect(withAttachments("look", [])).toBe("look");
    expect(buildArgs("hi", undefined, { addDirs: ["/x/y"] })).toContain("--add-dir=/x/y");
    expect(() => buildArgs("hi", undefined, { addDirs: ["rel"] })).toThrow();
    expect(() => buildArgs("hi", undefined, { addDirs: ["/x/../y"] })).toThrow();
  });
  it("removes old uploads only", async () => {
    const app = Fastify(); registerUploads(app); await app.ready();
    const old = (await app.inject({ method: "POST", url: "/api/uploads", payload: { name: "a", data: "YQ==" } })).json().id as string;
    const fresh = (await app.inject({ method: "POST", url: "/api/uploads", payload: { name: "b", data: "Yg==" } })).json().id as string;
    const past = Date.now() / 1000 - 30 * 86400;
    utimesSync(join(uploadRoot(), old), past, past);
    expect(cleanOldUploads(14)).toBe(1);
    expect(existsSync(join(uploadRoot(), old))).toBe(false);
    expect(existsSync(join(uploadRoot(), fresh))).toBe(true);
  });
});
