import { describe, expect, it } from "vitest";
import { checkRequest, makeToken } from "../server/security";

const exp = { port: 4317, token: "abc123" };
const good = { host: "127.0.0.1:4317", origin: undefined as string | undefined, token: "abc123" };

describe("security", () => {
  it("makeToken is 48 hex chars and unique", () => {
    const t = makeToken();
    expect(t).toMatch(/^[0-9a-f]{48}$/);
    expect(makeToken()).not.toBe(t);
  });
  it("accepts a good request", () => {
    expect(checkRequest(good, exp)).toEqual({ ok: true });
    expect(checkRequest({ ...good, host: "localhost:4317", origin: "http://localhost:4317" }, exp).ok).toBe(true);
    expect(checkRequest({ ...good, origin: "http://127.0.0.1:5173" }, exp).ok).toBe(true);
  });
  it("rejects wrong host with 403", () => {
    expect(checkRequest({ ...good, host: "evil.com:4317" }, exp)).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest({ ...good, host: "127.0.0.1:1" }, exp)).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects foreign origin with 403", () => {
    expect(checkRequest({ ...good, origin: "https://evil.com" }, exp)).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects missing or wrong token with 401", () => {
    expect(checkRequest({ ...good, token: undefined }, exp)).toMatchObject({ ok: false, status: 401 });
    expect(checkRequest({ ...good, token: "abc124" }, exp)).toMatchObject({ ok: false, status: 401 });
    expect(checkRequest({ ...good, token: "short" }, exp)).toMatchObject({ ok: false, status: 401 });
  });
});
