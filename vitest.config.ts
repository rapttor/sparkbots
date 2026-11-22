import { configDefaults, defineConfig } from "vitest/config";

// Agent worktrees live in .claude/worktrees: their copies of the tests must not run from here.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, ".claude/**"] } });
