import { toolActivity, parseLine } from "../adapters/claude-code/parse";
import { discoverSessions, teamFor, teamColor } from "../adapters/claude-code/discover";
import { discoverSessions as discoverCodexSessions } from "../adapters/codex/discover";
import { parseLine as parseCodexLine, toolActivity as codexToolActivity } from "../adapters/codex/parse";
import { discoverSessions as discoverOpenCodeSessions } from "../adapters/opencode/discover";
import { parseLine as parseOpenCodeLine, toolActivity as opencodeToolActivity } from "../adapters/opencode/parse";
import { readLiveness } from "../adapters/claude-code/liveness";
import { Tailer } from "../adapters/claude-code/tail";
import { StatsAggregator } from "../stats/aggregate";
import { applyEvent, initialRuntime, tick, thresholdsFrom, type Runtime } from "./state";
import type { AgentEvent, LiveInfo, SessionRef, Snapshot, Team, Worker, WorkStats } from "../adapters/types";
import { loadJson, saveJson, type Config, type Teams } from "../config";
import { OPENCODE_DEFAULT_COLOR } from "../../src/shared/opencode";
import { LabelStore } from "../labels";
import { BotColors } from "../botColors";
import { History } from "../history";
import { Archive } from "../archive";
import { SearchIndex } from "../search";
import { AppDb, hourly } from "../db";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** Context size at the last model call: everything sent as input (fresh + cache read + cache write). */
const ctxOf = (rows: [number, string, number, number, number, number][]) => { const r = rows[rows.length - 1]; return r ? r[2] + r[4] + r[5] : 0; };
const ACTIVE_GAP_MS = 5 * 60_000;
const lighter = (hex: string, amount = 0.22) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount).toString(16).padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
};

export class Company {
  sessions = new Map<string, SessionRef>();
  runtimes = new Map<string, Runtime>();
  live = new Map<string, LiveInfo>();
  tailer = new Tailer();
  stats = new StatsAggregator();
  db = new AppDb();
  skipped = 0;
  labels = new LabelStore();
  botColors = new BotColors();
  history = new History();
  archive = new Archive();
  private _search?: SearchIndex;
  /** The full-text index is created on first use (it opens a SQLite file). */
  get search(): SearchIndex { return (this._search ??= new SearchIndex()); }
  /** Index new/changed transcripts in the background; cheap when nothing changed. */
  indexSessions(): Promise<void> {
    return this.search.build([...this.sessions.values()].map((s) => ({ path: s.file, session: s.id, size: s.sizeBytes, mtime: s.mtimeMs })));
  }
  sessionStats = new Map<string, WorkStats>();
  constructor(public cfg: Config, public teams: Teams) {}

  private rt(id: string, now: number, last = 0) {
    let r = this.runtimes.get(id);
    if (!r) { r = initialRuntime(now, last); this.runtimes.set(id, r); }
    return r;
  }

  async refreshSessions() {
    const now = Date.now();
    const [claude, codex, opencode] = await Promise.all([discoverSessions(), discoverCodexSessions(), discoverOpenCodeSessions()]);
    for (const s of [...claude.map((x) => ({ ...x, source: "claude" as const })), ...codex, ...opencode]) { this.sessions.set(s.id, s); this.rt(s.id, now, s.mtimeMs); }
  }
  /** OpenCode is a live database: poll it cheaply, mirror changed chats, and return the ids that need ingesting. */
  async refreshOpenCodeSessions(): Promise<string[]> {
    const list = await discoverOpenCodeSessions();
    const seen = new Set(list.map((s) => s.id));
    const changed: string[] = [];
    for (const s of list) {
      const old = this.sessions.get(s.id);
      this.sessions.set(s.id, s);
      this.rt(s.id, Date.now(), s.mtimeMs);
      if (!old || old.mtimeMs !== s.mtimeMs || old.sizeBytes !== s.sizeBytes) { this.tailer.forget(s.file); changed.push(s.id); }
    }
    for (const [id, s] of this.sessions) if (s.source === "opencode" && !seen.has(id)) { this.sessions.delete(id); this.runtimes.delete(id); this.live.delete(id); }
    return changed;
  }
  async refreshLiveness() { this.live = await readLiveness(); }

  /** Tail one file and feed events into the state machine. Returns number of events. */
  async ingest(id: string, initial = false): Promise<number> {
    const s = this.sessions.get(id); if (!s) return 0;
    let n = 0;
    try {
      for (const line of await this.tailer.read(s.file)) {
        const p = this.parse(s, line);
        if (!p.ok) { this.skipped++; continue; }
        for (const e of p.events) { n++; this.dispatch(e, s, initial); }
      }
    } catch { /* file vanished mid-read */ }
    return n;
  }

  private dispatch(e: AgentEvent, s: SessionRef, initial: boolean) {
    e = { ...e, session: s.id };
    const r = this.rt(s.id, Date.now());
    if (initial && e.kind !== "tool" && e.kind !== "message") { /* history: only track last-seen */ }
    applyEvent(r, e, (t, target) => s.source === "codex" ? codexToolActivity(t) : s.source === "opencode" ? opencodeToolActivity(t, target) : toolActivity(t, { command: target }));
    if (!initial) this.history.record(e);
    if (initial) { r.state = "asleep"; r.since = Date.now(); r.helpers.clear(); } // history never implies "working"
  }

  private parse(s: SessionRef, line: string) { return s.source === "codex" ? parseCodexLine(line) : s.source === "opencode" ? parseOpenCodeLine(line) : parseLine(line); }

  /** Lazy full-history stats pass (background). Per-file results cached in ~/.agent-office/cache/stats.json by size+mtime. */
  async buildStats() {
    type Row = [number, string, number, number, number, number]; // at, model, in, out, cacheRead, cacheWrite
    type Entry = { size: number; mtimeMs: number; start: number; rows: Row[]; turns?: number; tools?: number; workMs?: number; source?: string; project?: string };
    const cache = loadJson<{ schemaVersion: 1; files: Record<string, Entry> }>("cache/stats.json", { schemaVersion: 1, files: {} });
    const files: Record<string, Entry> = {}; let changed = false;
    const stored = this.db.usageSessions();
    const agg = new StatsAggregator(); // a fresh one each pass; swapped in at the end so readers never see half a rebuild
    for (const s of this.sessions.values()) {
      let e = cache.files?.[s.file], reread = false;
      if (!e || e.size !== s.sizeBytes || e.mtimeMs !== s.mtimeMs || e.turns === undefined) {
        e = { size: s.sizeBytes, mtimeMs: s.mtimeMs, start: 0, rows: [], turns: 0, tools: 0, workMs: 0 }; changed = true; reread = true;
        let prev = 0;
        try {
          const rl = createInterface({ input: createReadStream(s.file), crlfDelay: Infinity });
          for await (const line of rl) for (const ev of this.parse(s, line).events) {
            if (!e.start) e.start = ev.at;
            if (ev.kind === "turn_start") e.turns!++;
            if (ev.kind === "tool") e.tools!++;
            if (prev && ev.at > prev && ev.at - prev < ACTIVE_GAP_MS) e.workMs! += ev.at - prev; // quiet gaps (> 5 min) are not work
            prev = Math.max(prev, ev.at);
            if (ev.kind === "usage") e.rows.push([ev.at, ev.model, ev.input, ev.output, ev.cacheRead, ev.cacheWrite]);
          }
        } catch { /* unreadable file: cache empty entry */ }
      }
      if (e.source !== (s.source ?? "claude") || e.project !== s.cwd) { e.source = s.source ?? "claude"; e.project = s.cwd; changed = true; } // remembered so history outlives the transcript file
      files[s.file] = e;
      this.sessionStats.set(s.id, { turns: e.turns ?? 0, tools: e.tools ?? 0, workMs: e.workMs ?? 0, tokens: e.rows.reduce((n, r) => n + r[2] + r[3], 0), ctx: ctxOf(e.rows) });
      if (e.start) agg.sessionStarted(s.id, s.cwd, e.start);
      if (reread || !stored.has(s.id)) this.db.replaceSession(s.id, hourly(s.id, e.source!, s.cwd, e.rows)); // kept forever, even after the transcript is deleted
    }
    // Transcripts the tool deleted (Claude Code removes old ones after ~30 days) are only in the cache file: move them into the database once.
    for (const [file, e] of Object.entries(cache.files ?? {})) {
      if (files[file] || !e.source || !e.project || stored.has(file)) continue;
      this.db.replaceSession(file, hourly(file, e.source, e.project, e.rows));
    }
    for (const r of this.db.allUsage()) agg.add({ kind: "usage", session: r.session, at: r.hour, model: r.model, input: r.input, output: r.output, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite }, r.project, r.source, r.n);
    this.stats = agg;
    if (changed || Object.keys(cache.files ?? {}).length !== Object.keys(files).length) saveJson("cache/stats.json", { schemaVersion: 1, files });
  }

  /** Exact events from installed hooks (highest-priority source). */
  async applyHook(events: AgentEvent[]) {
    for (const e of events) {
      if (!this.sessions.has(e.session)) await this.refreshSessions();
      const s = this.sessions.get(e.session); if (!s) continue;
      const r = this.rt(s.id, e.at); r.hooked = true;
      applyEvent(r, e, (t, target) => toolActivity(t, { command: target })); // not counted in history: the transcript tail reports the same tool calls
    }
  }

  tickAll(now = Date.now()) {
    const t = thresholdsFrom(this.cfg);
    for (const [id, r] of this.runtimes) {
      const s = this.sessions.get(id);
      tick(r, now, { alive: this.live.has(id), mtimeMs: s?.mtimeMs ?? 0 }, t);
      if (s) this.history.observe({ session: id, team: teamFor(s.cwd, this.teams.merges), title: s.title, state: r.state, activity: r.activity }, now);
    }
  }

  snapshot(): Snapshot {
    const cutoff = Date.now() - this.cfg.historyDays * 86_400_000;
    const byTeam = new Map<string, Team>();
    for (const s of this.sessions.values()) {
      const r = this.runtimes.get(s.id)!; const liveInfo = this.live.get(s.id);
      if (!liveInfo && s.mtimeMs < cutoff) continue; // older & not live: not shown
      if (this.archive.has(s.id)) continue;           // archived by the user
      const team = teamFor(s.cwd, this.teams.merges);
      const chosen = this.botColors.colors[s.id];
      // Every uncustomized agent inherits a softer version of its project's color; a user-picked agent color is exact.
      const bot = chosen ?? (s.source === "opencode" ? OPENCODE_DEFAULT_COLOR : lighter(this.botColors.forTeam(team)));
      const w: Worker = { id: s.id, source: s.source ?? "claude", team, cwd: s.cwd, title: s.title, name: this.botColors.names[s.id], state: r.state, activity: r.activity,
        lastEventAt: Math.max(r.lastEventAt, s.mtimeMs), liveInTerminal: liveInfo?.kind === "interactive",
        helpers: r.helpers.size, model: s.model, preview: this.cfg.streamingMode ? undefined : r.preview, said: this.cfg.streamingMode ? undefined : r.said, stats: this.sessionStats.get(s.id), color: bot };
      let t = byTeam.get(team);
      if (!t) byTeam.set(team, t = { name: team, color: teamColor(team, this.teams.colors), workers: [], lastActivityAt: 0, labels: this.labels.forTeam(team), botColor: this.botColors.forTeam(team) });
      t.workers.push(w); t.lastActivityAt = Math.max(t.lastActivityAt, w.lastEventAt);
    }
    const teams = [...byTeam.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    for (const t of teams) t.workers.sort((a, b) => b.lastEventAt - a.lastEventAt);
    return { at: Date.now(), teams, skippedLines: this.skipped, labelDefs: this.labels.defs };
  }
}
