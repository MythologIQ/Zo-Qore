#!/usr/bin/env node
import { spawnSync } from "child_process";

const commands = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "assumptions:check"]],
];

for (const [cmd, args] of commands) {
  const printable = `${cmd} ${args.join(" ")}`;
  console.log(`\n[release-gate] running: ${printable}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`[release-gate] failed: ${printable}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n[release-gate] all checks passed.");
