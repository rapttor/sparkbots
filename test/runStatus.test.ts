import { describe, expect, it } from "vitest";
import { runProblem } from "../src/world/runStatus";

const retry = (attempt: number, error_status = 401) => ({ type: "system", subtype: "api_retry", attempt, max_retries: 10, error_status, error: "authentication_failed" });

describe("runProblem", () => {
  it("reports the latest retry with a readable reason", () => {
    expect(runProblem([{ type: "system", subtype: "init" }, retry(1), retry(3)])).toEqual({
      level: "retry", text: "Authentication failed (401): sign in again or check the API credentials, retrying 3/10",
    });
  });
  it("names a usage limit", () => {
    expect(runProblem([retry(1, 429)])!.text).toContain("Usage or rate limit reached (429)");
  });
  it("reports a failed result, truncating long text", () => {
    const p = runProblem([retry(1), { type: "result", is_error: true, result: "x".repeat(400) }])!;
    expect(p.level).toBe("error");
    expect(p.text.length).toBeLessThanOrEqual(301);
  });
  it("is quiet once the run recovered or finished fine", () => {
    expect(runProblem([retry(1), { type: "assistant", message: {} }])).toBeNull();
    expect(runProblem([retry(1), { type: "result", is_error: false, result: "ok" }])).toBeNull();
    expect(runProblem([])).toBeNull();
  });
});
