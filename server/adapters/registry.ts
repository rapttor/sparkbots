import { discoverSessions as discoverClaude } from "./claude-code/discover";
import { parseLine as parseClaude, toolActivity as claudeActivity, type ParsedLine } from "./claude-code/parse";
import { readLiveness } from "./claude-code/liveness";
import { discoverSessions as discoverCodex } from "./codex/discover";
import { parseLine as parseCodex, toolActivity as codexActivity, type CodexParseCtx } from "./codex/parse";
import { codexLiveness } from "./codex/liveness";
import { discoverSessions as discoverOpenCode } from "./opencode/discover";
import { parseLine as parseOpenCode, toolActivity as openCodeActivity } from "./opencode/parse";
import { recentMessages as recentClaude } from "./claude-code/transcript";
import { recentMessages as recentCodex } from "./codex/transcript";
import { recentMessages as recentOpenCode } from "./opencode/transcript";
import { OPENCODE_DEFAULT_COLOR } from "../../src/shared/opencode";
import type { ChatMessage } from "./claude-code/transcript";
import type { Activity, AgentSource, LiveInfo, SessionId, SessionRef } from "./types";

/**
 * What the read side of the model (`Company`) needs from an agent tool. One entry per source; adding a tool = adding an entry here
 * (plus its adapter folder), not another `if (source === ...)` in the model. Sending prompts / hiring is still per source in the routes.
 */
export interface SourceAdapter {
  id: AgentSource;
  /** All sessions the tool knows, each tagged with `source`. */
  discover(): Promise<SessionRef[]>;
  /** Live processes by session id; omitted when the tool has no process to look at. */
  liveness?(sessions: Iterable<SessionRef>): Promise<Map<SessionId, LiveInfo>>;
  /** A parser for ONE session's lines (it may keep state between lines, e.g. the Codex model name). */
  lineParser(): (line: string) => ParsedLine;
  toolActivity(tool: string, target?: string): Activity;
  /** The last chat messages of a session file (chat history in the agent dialog). */
  recentMessages(file: string, max?: number): Promise<ChatMessage[]>;
  /** Bot colour when the user chose none (default: the project's colour, lightened). */
  defaultColor?: string;
  /** A live database mirrored into files: sessions that stop being discovered are dropped from the office (OpenCode). */
  mirrored?: boolean;
}

export const ADAPTERS: readonly SourceAdapter[] = [
  {
    id: "claude",
    discover: async () => (await discoverClaude()).map((s) => ({ ...s, source: "claude" as const })),
    liveness: () => readLiveness(),
    lineParser: () => parseClaude,
    toolActivity: (t, target) => claudeActivity(t, { command: target }),
    recentMessages: recentClaude,
  },
  {
    id: "codex",
    discover: () => discoverCodex(),
    liveness: (sessions) => codexLiveness(sessions),
    lineParser: () => { const ctx: CodexParseCtx = {}; return (line) => parseCodex(line, ctx); },
    toolActivity: (t) => codexActivity(t),
    recentMessages: recentCodex,
  },
  {
    id: "opencode",
    discover: () => discoverOpenCode(),
    lineParser: () => parseOpenCode,
    toolActivity: (t, target) => openCodeActivity(t, target),
    recentMessages: recentOpenCode,
    defaultColor: OPENCODE_DEFAULT_COLOR,
    mirrored: true,
  },
];

export const adapterOf = (source: AgentSource | undefined): SourceAdapter => ADAPTERS.find((a) => a.id === (source ?? "claude")) ?? ADAPTERS[0]!;
