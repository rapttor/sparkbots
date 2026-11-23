import { useEffect } from "react";
import { create } from "zustand";
import { ACTIONS } from "./actions";
import { useNumberKeys } from "./numberKeys";
import { useStore } from "../state/store";
import { displayName } from "../util";

/** The Z key near an agent: a small numbered menu of the cosmetic "Perform" actions (1 = first). Nothing is sent to the agent. */
export const usePerform = create<{ id: string | null; open: (id: string) => void; close: () => void }>((set) => ({ id: null, open: (id) => set({ id }), close: () => set({ id: null }) }));
export const performActions = () => ACTIONS.filter((a) => a.kind === "fx" && a.key !== "f").slice(0, 9);

export function PerformPicker({ act }: { act: (key: string, id: string) => void }) {
  const id = usePerform((s) => s.id), close = usePerform((s) => s.close);
  const worker = useStore((s) => (id ? s.snapshot?.teams.flatMap((t) => t.workers).find((w) => w.id === id) : undefined));
  const list = performActions();
  const run = (key: string) => { if (id) act(key, id); close(); };
  useNumberKeys(list.map((a) => () => run(a.key)), !!id);
  useEffect(() => {
    if (!id) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key.toLowerCase() === "z") { e.stopImmediatePropagation(); e.preventDefault(); close(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [id, close]);
  if (!id) return null;
  return (
    <div className="perform-pick" role="dialog" aria-label="Perform">
      <div className="pp-title">🎬 Perform on <b>{worker ? displayName(worker) : "this agent"}</b> <button className="pp-x" aria-label="Close" onClick={close}>×</button></div>
      <div className="pp-grid">
        {list.map((a, i) => (
          <button key={a.key} className="pp-tile" style={{ "--c": a.color ?? "#94a3b8" } as React.CSSProperties} title={a.hint} onClick={() => run(a.key)}>
            <kbd>{i + 1}</kbd><span className="pp-i">{a.icon ?? "✨"}</span><span className="pp-t">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
