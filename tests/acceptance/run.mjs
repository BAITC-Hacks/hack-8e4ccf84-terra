import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const action = process.argv[2];
const owners = { import: "S02", train: "S06", backtest: "S08", export: "S08", verify: "S01-S08" };
if (!Object.hasOwn(owners, action)) {
  console.error("Usage: node tests/acceptance/run.mjs import|train|backtest|export|verify");
  process.exit(64);
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const script = `demo:${action}`;
const blockers = [];
if (!pkg.scripts?.[script]) blockers.push(`Missing npm script ${script}; owner ${owners[action]}`);
if (action === "verify" && !["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"].some(existsSync)) {
  blockers.push("Missing Docker Compose configuration; owner S01");
}
if (blockers.length) {
  console.error(JSON.stringify({ status: "BLOCKED", action, blockers }, null, 2));
  process.exit(2);
}
// Fixed allowlist; arguments and shell fragments cannot be injected by callers.
const start = performance.now();
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], {
  stdio: "inherit", shell: process.platform === "win32",
});
const code = result.status ?? 1;
console.error(JSON.stringify({ action, exitCode: code, seconds: (performance.now() - start) / 1000 }));
process.exit(code);
