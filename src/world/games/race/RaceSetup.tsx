import { useState } from "react";
import { raceHub, RACE_AUTO_KEY } from "./RaceLayer";
import { AGENT_SPEED, CAR_KINDS, CAR_TYPES, type CarKind } from "./carTypes";
import { pointAt } from "./track";
import { goTo } from "../goto";

/**
 * All race settings, rendered by the Games popover's "New game" tab when "Race" is the chosen game: car type (the same for everybody),
 * your own car's colour, how many cars, carmageddon, item boxes, whether idle agents race by themselves, and Start / Drive.
 * While a race runs the only race UI left is the HUD and the header's Stop button.
 */
export function RaceSetup({ onStarted }: { onStarted: () => void }) {
  const [, tick] = useState(0);
  const [msg, setMsg] = useState("");
  const [color, setColor] = useState("#ffd166");
  const [pick, setPick] = useState("");
  const again = () => tick((n) => n + 1);
  const sim = raceHub.sim;
  const toStart = () => { if (raceHub.track) { const p = pointAt(raceHub.track, -9); goTo(p.x, p.z); } };

  if (sim) {
    return (
      <div className="race-setup">
        <p>🏎 A race is running. Stop it with the red Stop button in the header{raceHub.userRacing ? " (or Esc)" : ""}.</p>
        {!raceHub.userRacing && !raceHub.carmageddon && sim.phase !== "over" && (
          <div>
            <select aria-label="Car to drive" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">take over a car…</option>
              {sim.racers.filter((r) => !r.out && r.finishedAt === null).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button type="button" disabled={!pick} onClick={() => { setMsg(raceHub.join(pick, color) ? "" : "Could not take that seat."); if (raceHub.userRacing) onStarted(); }}>Drive it</button>
          </div>
        )}
        {msg && <p role="alert">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="race-setup">
      <div>
        <label>Car <select aria-label="Car type" value={raceHub.kind} onChange={(e) => { raceHub.kind = e.target.value as CarKind; again(); }}>
          {CAR_KINDS.map((k) => <option key={k} value={k}>{CAR_TYPES[k].icon} {CAR_TYPES[k].name} · top {Math.round(CAR_TYPES[k].maxSpeed / AGENT_SPEED)}x agent</option>)}
        </select></label>{" "}
        <label>My colour <input type="color" aria-label="My car colour" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      </div>
      <div>
        <label>Cars <input type="number" min={2} max={8} aria-label="Number of cars" value={raceHub.cars} onChange={(e) => { raceHub.cars = Math.max(2, Math.min(8, Number(e.target.value) || 2)); again(); }} style={{ width: 48 }} /></label>{" "}
        <label title="Boost, missile and oil boxes on the road"><input type="checkbox" checked={raceHub.items} onChange={(e) => { raceHub.items = e.target.checked; again(); }} /> Items</label>{" "}
        <label title="Off by default. You drive anywhere, no road edge, and run agents over (they just flatten for a moment: cosmetic)."><input type="checkbox" checked={raceHub.carmageddon} onChange={(e) => { raceHub.carmageddon = e.target.checked; again(); }} /> Carmageddon</label>
      </div>
      <div>
        <button type="button" onClick={() => { if (raceHub.join(undefined, color)) { onStarted(); } else setMsg("Could not start."); }}>{raceHub.carmageddon ? "Start carmageddon" : "Drive"}</button>{" "}
        {!raceHub.carmageddon && <button type="button" onClick={() => { if (raceHub.start(false)) { toStart(); onStarted(); setMsg(""); } else setMsg("Needs at least two idle agents."); }}>Watch (agents only)</button>}
      </div>
      <label><input type="checkbox" checked={raceHub.auto} onChange={(e) => { raceHub.auto = e.target.checked; try { localStorage.setItem(RACE_AUTO_KEY, e.target.checked ? "1" : "0"); } catch { /* ignore */ } again(); }} /> Idle agents race on their own</label>
      <p className="muted">Arrows/WASD drive, Space drifts, E uses an item, C changes the camera, Esc stops.</p>
      {msg && <p role="alert">{msg}</p>}
    </div>
  );
}
