import { createInterface } from "node:readline/promises";
import { loadConfig } from "./config";
import { diffText, hookToken, installInto, isInstalled, readSettings, settingsPath, uninstallFrom, writeSettingsWithBackup } from "./adapters/claude-code/hooks";

/** `tsx server/index.ts hooks install|uninstall [--yes]` */
export async function runCli(args: string[]): Promise<boolean> {
  if (args[0] !== "hooks" || !["install", "uninstall"].includes(args[1])) return false;
  const cur = readSettings();
  const next = args[1] === "install" ? installInto(cur, loadConfig().port, hookToken()) : uninstallFrom(cur);
  const d = diffText(cur, next);
  if (!d) { console.log("Nothing to change."); return true; }
  console.log(`Changes to ${settingsPath()}:\n${d}\n`);
  if (!args.includes("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = (await rl.question("Apply? [y/N] ")).trim().toLowerCase(); rl.close();
    if (a !== "y") { console.log("Aborted."); return true; }
  }
  const backup = writeSettingsWithBackup(next);
  console.log(`Done.${backup ? ` Backup: ${backup}` : ""}`);
  void isInstalled; return true;
}
