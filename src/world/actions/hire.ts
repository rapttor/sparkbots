import { api } from "../../api";
import { displayName } from "../../util";
import type { BotAction } from "../actions";

/** Fork an agent into a NEW agent that continues from its conversation, with a first message you type. The original is untouched. */
const hire: BotAction = {
  key: "y", label: "Fork into a new agent", hint: "a copy that continues from this chat", kind: "real",
  confirm: (w) => `Fork "${displayName(w)}" into a new agent?\nYou will be asked for its first message next. The original session is not changed.`,
  run: async (id) => {
    const text = window.prompt("First message for the new agent:")?.trim();
    if (!text) return;
    await api.send(id, text, true);
  },
};
export default hire;
