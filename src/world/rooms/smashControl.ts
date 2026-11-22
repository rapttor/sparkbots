/** Shared flag between the anger room and World: while true, YOU are the weapon, so World parks the avatar/hand and ignores floor clicks and drags. Cosmetic only. */
export const smashCtl: { active: boolean; hasSession: boolean; stop?: () => void } = { active: false, hasSession: false };

import { registerMode } from "../../state/modes";
registerMode({ id: "smash", label: "Smashing", active: () => smashCtl.active || smashCtl.hasSession, stop: () => smashCtl.stop?.() });
