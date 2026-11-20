import type { Worker } from "../../server/adapters/types";

export function StateBadge({ state }: { state: Worker["state"] }) {
  return <span className={`badge s-${state}`}>{state}{state === "asleep" ? " Zzz" : ""}</span>;
}
