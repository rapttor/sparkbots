// Usage: npx tsx scripts/validate-simchat.ts [file.json ...]   (default: every file in src/simchat/threads/)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateAll } from "../src/simchat/schema";

const dir = join(process.cwd(), "src/simchat/threads");
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
const all: unknown[] = [];
for (const f of files) {
  try { const j = JSON.parse(readFileSync(f, "utf8")); if (!Array.isArray(j)) throw new Error("file must be a JSON array of threads"); all.push(...j); }
  catch (err) { console.error(`${f}: ${(err as Error).message}`); process.exitCode = 1; }
}
const errs = validateAll(all).filter((m) => !/chains to unknown thread/.test(m) || process.argv.length <= 2);
errs.forEach((m) => console.error(m));
console.log(`${all.length} threads, ${errs.length} problems`);
if (errs.length) process.exitCode = 1;
