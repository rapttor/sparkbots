import { open, stat } from "node:fs/promises";

/** Incremental JSONL tailer: remembers byte offsets, returns only complete new lines. */
export class Tailer {
  private offsets = new Map<string, number>();
  private partial = new Map<string, string>();

  /** Forget a file so the next read starts from the most recent tail again (used after a cache rebuild). */
  forget(file: string): void { this.offsets.delete(file); this.partial.delete(file); }

  /** First read of a file starts at max(0, size - initialBytes) and drops the (probably cut) first line. */
  async read(file: string, initialBytes = 128 * 1024): Promise<string[]> {
    const size = (await stat(file)).size;
    let start = this.offsets.get(file);
    let dropFirst = false;
    if (start === undefined) { start = Math.max(0, size - initialBytes); dropFirst = start > 0; }
    if (size < start) { start = 0; this.partial.delete(file); } // truncated/rotated
    if (size === start) { this.offsets.set(file, size); return []; }
    const fh = await open(file, "r");
    try {
      const buf = Buffer.alloc(size - start);
      await fh.read(buf, 0, buf.length, start);
      this.offsets.set(file, size);
      const text = (this.partial.get(file) ?? "") + buf.toString("utf8");
      const parts = text.split("\n");
      this.partial.set(file, parts.pop() ?? "");
      if (dropFirst) parts.shift();
      return parts.filter(Boolean);
    } finally { await fh.close(); }
  }
}
