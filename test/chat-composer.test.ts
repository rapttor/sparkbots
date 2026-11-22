import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter, commandName, listSlashCommands } from "../server/slashCommands";
import { slashQuery, filterSlash, BUILTIN_COMMANDS, type SlashItem } from "../src/shared/slash";
import { modelChoices, modelLabel } from "../src/shared/models";
import { imageType, attachedImageIds, stripAttachmentList } from "../src/shared/attachments";
import { withAttachments } from "../server/uploads";
import { lastModelOf } from "../server/model/company";

describe("slash commands", () => {
  it("parses frontmatter, with quotes and CRLF, and ignores files without it", () => {
    expect(parseFrontmatter("---\ndescription: \"Do it\"\nargument-hint: [a] [b]\n---\nbody")).toEqual({ description: "Do it", "argument-hint": "[a] [b]" });
    expect(parseFrontmatter("---\r\nname: x\r\n---\r\nbody")).toEqual({ name: "x" });
    expect(parseFrontmatter("no frontmatter")).toEqual({});
    expect(parseFrontmatter("---\nunterminated")).toEqual({});
  });
  it("names sub-folder commands with a colon", () => {
    expect(commandName("review.md")).toBe("review");
    expect(commandName("git/commit.md")).toBe("git:commit");
  });
  it("lists project then user commands and skills read-only, project wins, built-ins last", () => {
    const root = mkdtempSync(join(tmpdir(), "sc-")), proj = join(root, "proj"), home = join(root, "home");
    mkdirSync(join(proj, ".claude", "commands", "git"), { recursive: true });
    mkdirSync(join(home, ".claude", "commands"), { recursive: true });
    mkdirSync(join(home, ".claude", "skills", "pdf"), { recursive: true });
    writeFileSync(join(proj, ".claude", "commands", "review.md"), "---\ndescription: Review the diff\n---\nx");
    writeFileSync(join(proj, ".claude", "commands", "git", "commit.md"), "---\nargument-hint: [msg]\n---\nx");
    writeFileSync(join(proj, ".claude", "commands", "notes.txt"), "ignored");
    writeFileSync(join(home, ".claude", "commands", "review.md"), "---\ndescription: user one\n---\nx");
    writeFileSync(join(home, ".claude", "commands", "deploy.md"), "x");
    writeFileSync(join(home, ".claude", "skills", "pdf", "SKILL.md"), "---\nname: pdf\ndescription: Work with PDFs\n---\n");
    const l = listSlashCommands(proj, home);
    expect(l.find((i) => i.name === "review")).toMatchObject({ source: "project", description: "Review the diff" });
    expect(l.find((i) => i.name === "git:commit")).toMatchObject({ source: "project", argumentHint: "[msg]" });
    expect(l.find((i) => i.name === "deploy")?.source).toBe("user");
    expect(l.find((i) => i.name === "pdf")).toMatchObject({ source: "skill", description: "Work with PDFs" });
    expect(l.filter((i) => i.name === "review").length).toBe(1);
    expect(l.some((i) => i.name === "notes")).toBe(false);
    expect(l.slice(-BUILTIN_COMMANDS.length).map((i) => i.name)).toEqual(BUILTIN_COMMANDS.map((i) => i.name));
  });
  it("copes with missing folders", () => {
    const l = listSlashCommands("/nonexistent/x", "/nonexistent/h");
    expect(l.map((i) => i.name)).toEqual(BUILTIN_COMMANDS.map((i) => i.name));
  });
  const items: SlashItem[] = [{ name: "review", source: "project", description: "Review code" }, { name: "compact", source: "builtin" }, { name: "git:commit", source: "project", description: "make a commit" }];
  it("detects a lone slash word only", () => {
    expect(slashQuery("/com")).toBe("com");
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/git:co")).toBe("git:co");
    expect(slashQuery("/compact now")).toBeNull();
    expect(slashQuery("hello /x")).toBeNull();
  });
  it("filters by prefix first, then by substring in name or description", () => {
    expect(filterSlash(items, "c").map((i) => i.name)).toEqual(["compact", "review", "git:commit"]);
    expect(filterSlash(items, "").length).toBe(3);
    expect(filterSlash(items, "zzz")).toEqual([]);
    expect(filterSlash(items, "", 2).length).toBe(2);
  });
});

describe("model choices", () => {
  it("lists default, the chat's model, aliases, services, and a custom value once", () => {
    const c = modelChoices("my-model", "claude-sonnet-5-5", ["llama3", "sonnet"]);
    expect(c.map((x) => x.value)).toEqual(["", "claude-sonnet-5-5", "opus", "sonnet", "haiku", "llama3", "my-model"]);
    expect(modelChoices("opus", undefined, []).map((x) => x.value)).toEqual(["", "opus", "sonnet", "haiku"]);
  });
  it("labels the button with the choice or the chat's current model", () => {
    expect(modelLabel("opus", "x")).toBe("opus");
    expect(modelLabel("", "claude-sonnet-5-5")).toBe("claude-sonnet-5-5 (current)");
    expect(modelLabel("", undefined)).toBe("default");
  });
});

describe("attachment previews", () => {
  it("knows previewable image types by extension", () => {
    expect(imageType("a.PNG")).toBe("image/png");
    expect(imageType("a.jpeg")).toBe("image/jpeg");
    expect(imageType("a.svg")).toBeNull();
    expect(imageType("noext")).toBeNull();
  });
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const msg = withAttachments("look", [{ path: `/home/u/.agent-office/uploads/${id}/shot.png`, name: "shot.png" }, { path: `/home/u/.agent-office/uploads/${id.replace("0000", "1111")}/doc.pdf`, name: "doc.pdf" }]);
  it("finds image uploads listed in a sent message, not other files", () => {
    expect(attachedImageIds(msg)).toEqual([{ id, name: "shot.png" }]);
    expect(attachedImageIds("no attachments")).toEqual([]);
  });
  it("strips the appended list from the shown text", () => {
    expect(stripAttachmentList(msg)).toBe("look");
    expect(stripAttachmentList("plain")).toBe("plain");
  });
});

describe("session model", () => {
  it("is the latest real model of the transcript, skipping synthetic markers", () => {
    const row = (m: string): [number, string, number, number, number, number] => [0, m, 0, 0, 0, 0];
    expect(lastModelOf([row("claude-opus-5-5"), row("claude-sonnet-5-5")])).toBe("claude-sonnet-5-5");
    expect(lastModelOf([row("claude-sonnet-5-5"), row("<synthetic>")])).toBe("claude-sonnet-5-5");
    expect(lastModelOf([])).toBeUndefined();
  });
});
