export type ServiceKind = "ollama" | "lmstudio" | "llamacpp" | "opencode" | "openai-compatible" | "other";

export const SERVICE_KINDS: readonly ServiceKind[] = ["ollama", "lmstudio", "llamacpp", "opencode", "openai-compatible", "other"];

export interface Service {
  id: string;
  kind: ServiceKind;
  name: string;
  url: string;
  source: "scan" | "manual";
  /** Never leaves the server: use publicView() for anything sent to the client. */
  token?: string;
  addedAt: number;
}

export interface ServiceStatus {
  id: string;
  up: boolean;
  latencyMs?: number;
  version?: string;
  models?: string[];
  loaded?: string[];
  error?: string;
  checkedAt: number;
}
