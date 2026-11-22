import { useStore } from "../state/store";

/** Small project chip in the project's own colour (13.4.4): same colour as its floor area and its agents' hats in the 3D office. */
export function ProjectBadge({ team, color }: { team: string; color?: string }) {
  const found = useStore((s) => s.snapshot?.teams.find((t) => t.name === team)?.color);
  const c = color ?? found ?? "#888888";
  return <span className="label-chip" style={{ borderColor: c, color: c }} title={`Project: ${team}`}><span className="swatch" style={{ background: c }} /> {team}</span>;
}
