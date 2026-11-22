import { describe, expect, it } from "vitest";
import { AUTO_MS, MANUAL_MS, RateLimit, isRateLimited } from "../server/rateLimit";

const retry = (status: number) => ({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, error_status: status, error: "rate_limit" });
const result = (is_error: boolean, text = "ok") => ({ type: "result", is_error, result: text });

describe("isRateLimited", () => {
  it("detects a 429 retry and a usage-limit result", () => {
    expect(isRateLimited([retry(429)])).toBe(true);
    expect(isRateLimited([result(true, "Claude usage limit reached")])).toBe(true);
  });
  it("ignores other problems and healthy runs", () => {
    expect(isRateLimited([retry(401)])).toBe(false);
    expect(isRateLimited([result(false)])).toBe(false);
    expect(isRateLimited([retry(429), { type: "assistant" }])).toBe(false);
    expect(isRateLimited([])).toBe(false);
  });
});

describe("RateLimit flag", () => {
  it("sets until on detection, reports a change, and clears when a run succeeds", () => {
    const r = new RateLimit();
    expect(r.until(0)).toBe(0);
    expect(r.observe([retry(429)], 1000)).toBe(true);
    expect(r.until(1001)).toBe(1000 + AUTO_MS);
    expect(r.observe([retry(429)], 1500)).toBe(false); // extends, but was already on
    expect(r.until(1000 + AUTO_MS + 1500)).toBe(0);    // expired
    r.observe([retry(429)], 2000);
    expect(r.observe([retry(429), { type: "assistant" }, result(false)], 3000)).toBe(true);
    expect(r.until(3001)).toBe(0);
  });
  it("manual toggle on and off", () => {
    const r = new RateLimit();
    r.setManual(true, 0);
    expect(r.until(1)).toBe(MANUAL_MS);
    r.setManual(false, 5);
    expect(r.until(6)).toBe(0);
  });
});
