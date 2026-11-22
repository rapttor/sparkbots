export type SessionId = string;
export type Ts = number; // epoch ms
export type AgentSource = "claude" | "codex" | "opencode";

export interface SessionRef {
  id: SessionId;
  source?: AgentSource;
  file: string;        // absolute path to <id>.jsonl
  cwd: string;         // project working dir (from records, fallback decoded folder)
  title: string;       // <= 60 chars
  mtimeMs: number;
  sizeBytes: number;
  model?: string;      // provider/model when the source records it (OpenCode)
}

export interface LiveInfo {
  pid: number;
  kind: "interactive" | "headless" | "unknown";
  startedAt?: Ts;
}

export type AgentEvent =
  | { kind: "tool"; session: SessionId; tool: string; target?: string; at: Ts }
  | { kind: "turn_start" | "turn_end"; session: SessionId; at: Ts }
  | { kind: "message"; session: SessionId; role: "user" | "assistant"; preview: string; at: Ts }
  | { kind: "usage"; session: SessionId; model: string; input: number; output: number; cacheRead: number; cacheWrite: number; at: Ts }
  | { kind: "permission_wait"; session: SessionId; at: Ts }
  | { kind: "subagent"; session: SessionId; childId: string; state: "start" | "end"; at: Ts }
  | { kind: "error"; session: SessionId; message: string; at: Ts };

export interface SendOpts { allowedTools?: string[]; permissionMode?: string; fork?: boolean; model?: string; addDirs?: string[] }
export interface RunHandle { runId: string; pid: number; session?: SessionId; stop(): void }

export interface AgentAdapter {
  id: string;
  discover(): Promise<SessionRef[]>;
  watch(onEvent: (e: AgentEvent) => void): () => void;
  liveness(): Promise<Map<SessionId, LiveInfo>>;
  send?(session: SessionId, prompt: string, opts: SendOpts): RunHandle;
  spawn?(cwd: string, prompt: string, opts: SendOpts): RunHandle;
}

export type Activity = "researching" | "coding" | "testing" | "shipping" | "running" | "delegating" | "planning" | "idle";
export type WorkerState = "asleep" | "idle" | "working" | "waiting" | "done" | "error";

export interface Worker {
  id: SessionId;
  source?: AgentSource;
  team: string;
  cwd: string;
  title: string;
  name?: string;       // custom display name chosen by the user; title stays the original session title
  state: WorkerState;
  activity: Activity;
  lastEventAt: Ts;
  liveInTerminal: boolean;
  helpers: number;
  model?: string;      // provider/model when known (OpenCode)
  preview?: string;
  said?: { text: string; at: Ts }; // latest assistant message; hidden in streaming mode
  color: string; // bot color: own choice, else the project's, else default orange
  stats?: WorkStats; // filled once the background stats pass has read this session
}
/** What a worker has processed in total (from its whole transcript). tokens = input+output (no cache). */
export interface WorkStats { turns: number; tools: number; tokens: number; workMs: number; ctx: number }
export interface LabelDef { id: string; name: string; color: string; onMap: boolean }
export interface Team { name: string; color: string; workers: Worker[]; lastActivityAt: Ts; labels: string[]; botColor: string }
export interface Snapshot { at: Ts; teams: Team[]; skippedLines: number; labelDefs: LabelDef[]; rateLimitedUntil?: Ts } // rateLimitedUntil: set while the model service is rate limited (cosmetic: nervous mode)
