import { loadJson, saveJson } from "./config";

export class ArchiveError extends Error { constructor(public status: number, m: string) { super(m); } }

/**
 * Archived agents: hidden from the office, listed in Settings > Archive, restorable. Only SparkBots' own file
 * (~/.agent-office/archive.json) changes: nothing in ~/.claude is touched and no session is ever deleted.
 */
export class Archive {
  items: Record<string, { at: number }>;
  constructor() {
    const f = loadJson<{ schemaVersion: 1; items: Record<string, { at: number }> }>("archive.json", { schemaVersion: 1, items: {} });
    this.items = f.items && typeof f.items === "object" ? f.items : {};
  }
  has(id: string): boolean { return id in this.items; }
  /** `confirm` must be literally true: archiving is explicit, never a side effect of anything else. */
  set(id: string, archived: unknown, confirm: unknown, liveInTerminal: boolean): void {
    if (typeof archived !== "boolean") throw new ArchiveError(400, "archived must be true or false");
    if (archived) {
      if (confirm !== true) throw new ArchiveError(400, "archiving needs confirm: true");
      if (liveInTerminal) throw new ArchiveError(409, "this session is live in a terminal; close it first");
      this.items[id] = { at: Date.now() };
    } else delete this.items[id];
    saveJson("archive.json", { items: this.items });
  }
}
