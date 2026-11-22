#!/usr/bin/env node
// Fake `opencode`: runs ~FAKE_MS then exits 0 (never touches a real model).
setTimeout(() => process.exit(0), Number(process.env.FAKE_MS ?? 600));
