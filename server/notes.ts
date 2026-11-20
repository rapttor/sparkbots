import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { loadJson, saveJson } from "./config";

/** Whiteboard notes of the Manager room, kept in ~/.agent-office/notes.json. */
export const NOTE_COLORS = ["#ffe66d", "#ff9fb2", "#8fd6ff", "#a8e6a1", "#ffbe6b", "#d4b5ff"] as const;
export const MAX_NOTES = 60;
export const MAX_TEXT = 500;
export interface Note { id: string; text: string; color: string; x: number; y: number; createdAt: number; updatedAt: number }
interface NotesFile { schemaVersion: 1; notes: Note[] }
export interface NoteInput { text?: string; color?: string; x?: number; y?: number }

const load = () => loadJson<NotesFile>("notes.json", { schemaVersion: 1, notes: [] });
const save = (f: NotesFile) => saveJson("notes.json", f);
const bad = (m: string) => Object.assign(new Error(m), { statusCode: 400 });
const unit = (v: unknown, name: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) throw bad(`${name} must be a number between 0 and 1`);
  return v;
};

/** Pure validation: returns only the known, valid fields of a request body. Throws a 400 error otherwise. */
export function validateNoteInput(body: unknown): NoteInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw bad("body must be an object");
  const b = body as Record<string, unknown>, out: NoteInput = {};
  if (b.text !== undefined) {
    if (typeof b.text !== "string") throw bad("text must be a string");
    const t = b.text.trim();
    if (!t) throw bad("text required");
    if (t.length > MAX_TEXT) throw bad(`text is limited to ${MAX_TEXT} characters`);
    out.text = t;
  }
  if (b.color !== undefined) {
    if (typeof b.color !== "string" || !(NOTE_COLORS as readonly string[]).includes(b.color)) throw bad("bad color");
    out.color = b.color;
  }
  if (b.x !== undefined) out.x = unit(b.x, "x");
  if (b.y !== undefined) out.y = unit(b.y, "y");
  return out;
}

export function registerNotes(app: FastifyInstance, changed: () => void): void {
  app.get("/api/notes", async () => ({ notes: load().notes }));

  app.post("/api/notes", async (req) => {
    const p = validateNoteInput(req.body);
    if (!p.text) throw bad("text required");
    const f = load();
    if (f.notes.length >= MAX_NOTES) throw bad(`at most ${MAX_NOTES} notes`);
    const now = Date.now(), n = f.notes.length;
    const note: Note = {
      id: randomUUID(), text: p.text, color: p.color ?? NOTE_COLORS[0],
      x: p.x ?? 0.1 + (n % 5) * 0.19, y: p.y ?? 0.12 + (Math.floor(n / 5) % 5) * 0.19, // tidy grid unless placed
      createdAt: now, updatedAt: now,
    };
    f.notes.push(note); save(f); changed(); return note;
  });

  app.patch<{ Params: { id: string } }>("/api/notes/:id", async (req) => {
    const f = load(), note = f.notes.find((x) => x.id === req.params.id);
    if (!note) throw bad("no such note");
    Object.assign(note, validateNoteInput(req.body), { updatedAt: Date.now() });
    save(f); changed(); return note;
  });

  app.delete<{ Params: { id: string } }>("/api/notes/:id", async (req) => {
    const f = load(); f.notes = f.notes.filter((x) => x.id !== req.params.id);
    save(f); changed(); return { ok: true };
  });
}
