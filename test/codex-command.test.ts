import { describe, expect, it } from "vitest";
import { buildQueueArgs, CodexCommandError } from "../server/adapters/codex/command";

const ID = "01a1fd1a-8a2e-7b50-a44f-0f67b7b42e84";

describe("Codex queue command", () => {
  it("passes the message as one literal argument", () => {
    const prompt = "check this; $(touch /tmp/nope) && echo `nope`";
    expect(buildQueueArgs(`codex:${ID}`, prompt)).toEqual(["queue", "--thread", ID, "--message", prompt, "--resume"]);
  });
  it("rejects invalid thread ids", () => {
    expect(() => buildQueueArgs("codex:--last", "hello")).toThrow(CodexCommandError);
  });
});
