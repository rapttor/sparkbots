import { describe, expect, it } from "vitest";
import { parseBacklog } from "../server/backlog";

describe("parseBacklog", () => {
  it("reads the template format", () => {
    const [a, b] = parseBacklog("## Auth\n- [ ] [todo](tasks/T1.md) Add login [model: haiku] [depends: none]\n- [x] [done](tasks/T2.md) Hash passwords");
    expect(a).toMatchObject({ heading: "Auth", status: "todo", link: "tasks/T1.md", model: "haiku", depends: "none", text: "Add login" });
    expect(b).toMatchObject({ status: "done", text: "Hash passwords" });
  });
  it("reads the free style: status words, question titles, loose lines, plain ideas", () => {
    const items = parseBacklog("# Ideas\n[DONE](a.md) codex works\n- [13.2 planned](b.md) data center\n- [why is this slow?] check it\n- just an idea");
    expect(items.map((i) => i.status)).toEqual(["done", "planned", "question", "idea"]);
    expect(items[0]!.text).toBe("codex works");
  });
  it("ignores prose and caps the list", () => {
    expect(parseBacklog("some prose\n\nmore prose")).toEqual([]);
    expect(parseBacklog("- a\n- b\n- c", 2)).toHaveLength(2);
  });
});
