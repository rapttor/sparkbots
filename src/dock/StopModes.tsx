import { stopAllModes, useActiveModes } from "../state/modes";

/** A big red Stop button in the header while a game, race or smashing session is on; one click ends them all and returns to normal. */
export function StopModes() {
  const labels = useActiveModes();
  if (!labels.length) return null;
  return (
    <button className="stop-modes" title={`Stop ${labels.join(", ")} and go back to normal`} aria-label={`Stop ${labels.join(", ")}`} onClick={stopAllModes}>
      <span className="stop-modes-icon" aria-hidden="true" />
      <small>stop</small>
    </button>
  );
}
