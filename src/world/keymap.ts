import { ACTIONS } from "./actions";

/** Every key / mouse binding of the 3D office, in one list: the legend in the 3D view and the Settings > Keymap page both read it. */
export interface KeyDef {
  id: string;
  keys: string;
  label: string;
  /** Can be run by clicking it in the 3D legend (the 3D view supplies the handler and says when it is not possible right now). */
  actionable: boolean;
  /** Which tab of the legend it is on (default "basics"). */
  tab?: KeyTab;
}

export type KeyTab = "basics" | "games" | "race" | "popups";
export const KEY_TABS: { id: KeyTab; label: string; icon: string }[] = [
  { id: "basics", label: "Basics", icon: "⌨️" }, { id: "games", label: "Games", icon: "🎮" }, { id: "race", label: "Race", icon: "🏎" }, { id: "popups", label: "Popups", icon: "🔢" },
];

export const KEYMAP: KeyDef[] = [
  { id: "camera", keys: "C", label: "Camera behind you at the default zoom (zoom in = first-person, zoom out = overview)", actionable: true },
  { id: "talk", keys: "E", label: "Talk to the nearby agent", actionable: true },
  ...ACTIONS.filter((a) => a.kind === "real" || a.key === "f").map((a): KeyDef => ({ id: `action:${a.key}`, keys: a.key.toUpperCase(), label: `${a.label}: ${a.hint}`, actionable: true })),
  { id: "perform", keys: "Z", label: "Perform on the nearest agent: opens a numbered picker (1-9 runs one)", actionable: false },
  { id: "minimap", keys: "M", label: "Open the Map tab (the minimap)", actionable: true },
  { id: "teleport", keys: "Space", label: "Quick map: click anywhere to fly there", actionable: true },
  { id: "lock", keys: "L", label: "Lock / unlock zoom", actionable: true },
  { id: "coffee", keys: "O", label: "Order a coffee (the barista sends a robot to you)", actionable: true },
  { id: "rally", keys: "R", label: "Rally: every agent waiting for you comes to you", actionable: true },
  { id: "wake", keys: "U", label: "Boss is coming: a few nearby sleepers jump up and look busy", actionable: true },
  { id: "lunch", keys: "I", label: "Lunch break: idle agents go to the rooms", actionable: true },
  { id: "dismiss", keys: "X", label: "Release the meeting: send every follower back", actionable: true },
  { id: "meeting", keys: "Q", label: "Meeting chat with the followers", actionable: true },
  { id: "follow-click", keys: "Shift+click", label: "Add / remove a follower", actionable: false },
  { id: "tags", keys: "T", label: "Show / hide name tags", actionable: true },
  { id: "reset", keys: "0", label: "Reset the view", actionable: true },
  { id: "esc", keys: "Esc", label: "Close the open menu or chat", actionable: true },
  { id: "move", keys: "W A S D / arrows", label: "Avatar: move. Hand: A/D turn, W/S zoom", actionable: false },
  { id: "sprint", keys: "Shift", label: "Hold while walking to sprint (speeds up)", actionable: false },
  { id: "floor", keys: "Click floor", label: "Avatar: walk there. Hand: move the hand there", actionable: false },
  { id: "agent", keys: "Click agent", label: "Open the agent menu", actionable: false },
  { id: "dbl", keys: "Double-click project", label: "Go to that project", actionable: false },
  { id: "rdrag", keys: "Right-drag", label: "Turn the view", actionable: false },
  { id: "wheel", keys: "Scroll", label: "Zoom (in = first-person, out = overview)", actionable: false },
  { id: "view-turn", keys: "[ / ]", label: "Turn the view left / right: hold (Shift = faster). Same as the ↶ ↷ buttons in the corner", actionable: false },
  { id: "view-zoom", keys: "- / =", label: "Zoom out / in: hold (Shift = faster). Same as the − ＋ buttons", actionable: false },

  // ---- Games tab: playing at a table (Games chip > New game > Play vs agent) ----
  { id: "g-start", tab: "games", keys: "🎮 Games", label: "New game: ▶ Autoplay (agent vs agent) or 🎮 Play vs agent (you take seat 1; a guest bot plays if nobody is free). Rankings are on the other tab", actionable: false },
  { id: "g-pong", tab: "games", keys: "↑ ↓ ← → / WASD", label: "Pong: ↑ ↓ move sideways, ← → step back and forth (further back hits harder but reaches less). Air hockey: move the mallet", actionable: false },
  { id: "g-billiards", tab: "games", keys: "← → ↑ ↓", label: "Billiards: ← → turn the cue, ↑ ↓ set the power (1-9), a yellow line shows the shot", actionable: false },
  { id: "g-shoot", tab: "games", keys: "Space / Enter / 1", label: "Billiards: strike. Basketball: stop the meter (first the angle, then the power)", actionable: false },
  { id: "g-rps", tab: "games", keys: "1 2 3", label: "Rock-paper-scissors: rock, paper, scissors", actionable: false },
  { id: "g-dice", tab: "games", keys: "1", label: "Dice: roll", actionable: false },
  { id: "g-leave", tab: "games", keys: "Esc / Leave", label: "Leave the table. The red Stop in the header ends every game and race", actionable: false },
  // ---- Race tab ----
  { id: "r-drive", tab: "race", keys: "↑ ↓ ← → / WASD", label: "Drive: throttle, brake / reverse, steer", actionable: false },
  { id: "r-drift", tab: "race", keys: "Space", label: "Handbrake: slide the car round a bend", actionable: false },
  { id: "r-nitro", tab: "race", keys: "Shift", label: "Nitro: 3x top speed for a moment, when the Nitro meter is full (it recharges in 9 s)", actionable: false },
  { id: "r-item", tab: "race", keys: "E", label: "Use the item you picked up from a box (boost, missile, oil)", actionable: false },
  { id: "r-cam", tab: "race", keys: "C", label: "Driver view on the nose of the vehicle / chase view behind it", actionable: false },
  { id: "r-monster", tab: "race", keys: "Monster truck", label: "A hard start rears it up on the back wheels (the nitro too); braking then rolls it over 2-3 times, forward at double speed", actionable: false },
  { id: "r-carma", tab: "race", keys: "Carmageddon", label: "Run agents over with the wheels: screams, thump and green coolant on the windshield. Sound can be switched off in Settings", actionable: false },
  { id: "r-stop", tab: "race", keys: "Esc", label: "Stop the race (the header Stop does too)", actionable: false },
  // ---- Popups tab: numbers answer popups ----
  { id: "p-numbers", tab: "popups", keys: "1 - 9", label: "Whenever a popup shows numbered options, that number picks the option (no mouse needed)", actionable: false },
  { id: "p-esc", tab: "popups", keys: "Esc", label: "Close the popup, picker or menu that is open", actionable: false },
  { id: "p-perform", tab: "popups", keys: "Z, then 1-9", label: "Perform picker for the nearest agent (dance, high-five, zap, ...). Z or Esc closes it", actionable: false },
  { id: "p-cooler", tab: "popups", keys: "1 2 3", label: "Water cooler chat: answer the agent. 🔀 Topic changes the subject, ✕ Bye ends the chat", actionable: false },
  { id: "p-anger", tab: "popups", keys: "1 - n", label: "Anger room: on entering, pick a weapon (the last number is \"Not today\"). At the reception during a run: 1 keep smashing, 2 exit", actionable: false },
  { id: "p-games", tab: "popups", keys: "1 2 3", label: "Game panel: rock-paper-scissors, 1 rolls the dice, shoots or stops the meter", actionable: false },
];

/** The key caps of an entry: alternatives written with " / " are shown one below the other ("Space / Enter / 1" = three caps); a group such as "↑ ↓ ← →" stays on one cap. */
export const keyCaps = (keys: string): string[] => keys.split(" / ").map((k) => k.trim()).filter(Boolean);
