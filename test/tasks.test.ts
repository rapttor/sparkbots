import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findTaskFile, parseTasks, runPrompt, taskInfo } from "../server/tasks";

describe("task lists", () => {
  it("counts checkboxes and finds the first phase with open work", () => {
    const r = parseTasks("# T\n## Phase 1\n- [x] a\n- [X] b\n## Phase 2\n- [ ] c\n  - [ ] d\n## Phase 3\n- [ ] e\n");
    expect(r).toEqual({ open: 3, done: 2, phase: "Phase 2" });
  });
  it("finds docs/TASKS.md, root tasklist.md, none", () => {
    const a = mkdtempSync(join(tmpdir(), "t-")); mkdirSync(join(a, "docs")); writeFileSync(join(a, "docs/TASKS.md"), "- [ ] x");
    expect(findTaskFile(a)).toBe("docs/TASKS.md"); expect(taskInfo(a)).toMatchObject({ open: 1, done: 0 });
    const b = mkdtempSync(join(tmpdir(), "t-")); writeFileSync(join(b, "tasklist.md"), "- [x] y");
    expect(findTaskFile(b)).toBe("tasklist.md");
    expect(findTaskFile(mkdtempSync(join(tmpdir(), "t-")))).toBeUndefined();
  });
  it("builds both prompts", () => {
    expect(runPrompt("phase", "docs/TASKS.md")).toBe("Review the task list (docs/TASKS.md) and break tasks down if possible, so we can utilize Haiku as much as possible. Finish this phase.");
    expect(runPrompt("all")).toContain("Finish all phases.");
  });
});

import { listTasks } from "../server/tasks";
describe("listTasks", () => {
  it("lists checkbox items with their heading and done flag", () => {
    const items = listTasks("# Plan\n## Phase 1\n- [x] first thing\n- [ ] second   thing\nnot a task\n* [X] third\n");
    expect(items).toEqual([
      { text: "first thing", done: true, phase: "Phase 1" },
      { text: "second thing", done: false, phase: "Phase 1" },
      { text: "third", done: true, phase: "Phase 1" },
    ]);
  });
});
