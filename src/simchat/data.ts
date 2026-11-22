import type { SimThread, Rating } from "./schema";
import type { ChatFilter } from "./settings";

/** Every bundled thread file (src/simchat/threads/*.json, each a JSON array). Bundled at build time: no fetches at runtime. */
const files = import.meta.glob("./threads/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
export const ALL_THREADS: SimThread[] = Object.values(files).flatMap((f) => (Array.isArray(f) ? (f as SimThread[]) : []));
const BY_ID = new Map(ALL_THREADS.map((t) => [t.id, t]));
export const threadById = (id: string): SimThread | undefined => BY_ID.get(id);

const ALLOWED: Record<ChatFilter, Rating[]> = { family: ["G", "PG"], pg13: ["G", "PG", "PG13"] };
export const allowedThreads = (filter: ChatFilter, pool: SimThread[] = ALL_THREADS): SimThread[] => pool.filter((t) => ALLOWED[filter].includes(t.rating));
