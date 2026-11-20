#!/usr/bin/env node
// Test double: echoes its argv as a stream-json line, like claude would emit session info.
console.log(JSON.stringify({ type: "system", session_id: "fake-session", argv: process.argv.slice(2) }));
