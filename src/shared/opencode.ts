/** Default colour of an OpenCode TARS bot (white monolith). A user-picked bot colour still wins. */
export const OPENCODE_DEFAULT_COLOR = "#f4f2ea";

/**
 * One model the local OpenCode CLI reports. `id` is the argv value (`provider/model`); the rest is metadata from
 * `opencode models --verbose` (cost is per 1M tokens as reported by models.dev). Unknown fields stay undefined.
 */
export interface OpenCodeModel {
  id: string;
  provider: string;
  model: string;
  name: string;
  family?: string;
  version?: string;      // release date when OpenCode reports one
  status?: string;
  context?: number;      // tokens
  output?: number;       // max output tokens
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  reasoning?: boolean;
  toolcall?: boolean;
  attachment?: boolean;
  inputs?: string[];     // text, image, audio, video, pdf
  variants?: string[];
}
