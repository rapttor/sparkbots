import { useStore } from "../../state/store";
import { sendView } from "../viewBus";

/** Take the manager to a spot on the map (a game table, the race start): walk mode, camera flies behind them. */
export function goTo(x: number, z: number): void {
  sendView({ t: "mode", mode: "walk" });
  useStore.getState().focusPoint(x, z);
}
/** The spot beside a table from where you see it and its players: on the near (south) side. */
export const spotBehindTable = (slot: { x: number; z: number }): { x: number; z: number } => ({ x: slot.x, z: slot.z + 3.4 });
