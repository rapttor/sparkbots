import { describe, expect, it } from "vitest";
import { AppDb, hourly } from "../server/db";

const H = 3_600_000;
describe("AppDb usage history", () => {
  it("groups rows by hour and model", () => {
    const rows = hourly("s", "claude", "p", [[H + 1, "m", 1, 2, 3, 4], [H + 5, "m", 1, 0, 0, 0], [2 * H, "m", 5, 0, 0, 0]]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ hour: H, input: 2, output: 2, cacheRead: 3, cacheWrite: 4, n: 2 });
  });
  it("replaces a session's rows and keeps other sessions", () => {
    const db = new AppDb(":memory:");
    db.replaceSession("a", hourly("a", "codex", "p", [[H, "m", 10, 0, 0, 0]]));
    db.replaceSession("b", hourly("b", "claude", "p", [[H, "m", 1, 0, 0, 0]]));
    db.replaceSession("a", hourly("a", "codex", "p", [[H, "m", 20, 0, 0, 0]]));
    expect(db.usageSessions()).toEqual(new Set(["a", "b"]));
    expect(db.allUsage().find((r) => r.session === "a")!.input).toBe(20);
    expect(db.allUsage()).toHaveLength(2);
  });
});
