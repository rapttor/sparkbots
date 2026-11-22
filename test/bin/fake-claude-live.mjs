#!/usr/bin/env node
// Fake `claude -p --input-format stream-json --permission-prompt-tool stdio`: for each user line it asks for permission to
// use "Write" (control_request), waits for the control_response, then answers and emits a result line. Test double only.
import { createInterface } from "node:readline";
const sid = process.argv[process.argv.indexOf("--resume") + 1] || "fake-live";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let waiting = null, turn = 0;
createInterface({ input: process.stdin }).on("line", (l) => {
  let j; try { j = JSON.parse(l); } catch { return; }
  if (j.type === "user") {
    turn++; out({ type: "system", subtype: "init", session_id: sid, argv: process.argv.slice(2), pid: process.pid });
    waiting = { id: `req-${turn}`, prompt: j.message.content };
    out({ type: "control_request", request_id: waiting.id, request: { subtype: "can_use_tool", tool_name: "Write", input: { file_path: "/tmp/x", content: "hi" }, tool_use_id: `tu-${turn}` } });
  } else if (j.type === "control_response" && waiting) {
    const r = j.response.response; const ok = r.behavior === "allow" && r.updatedInput?.file_path === "/tmp/x";
    out({ type: "assistant", session_id: sid, message: { role: "assistant", content: [{ type: "text", text: ok ? "allowed" : `denied: ${r.message}` }] } });
    out({ type: "result", subtype: "success", is_error: false, session_id: sid, permission_denials: [] });
    waiting = null;
  }
});
process.stdin.on("end", () => process.exit(0));
