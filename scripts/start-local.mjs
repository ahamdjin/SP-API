import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(root, "package-lock.json");
const nextPath = resolve(root, "node_modules", "next", "package.json");
const stampPath = resolve(root, "node_modules", ".sp-api-lock-hash");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const lockHash = createHash("sha256")
  .update(readFileSync(lockPath))
  .digest("hex");

const installedHash = existsSync(stampPath)
  ? readFileSync(stampPath, "utf8").trim()
  : "";

if (!existsSync(nextPath) || installedHash !== lockHash) {
  console.log("[SP-API] Installing npm dependencies for this repo...");
  const install = spawnSync(npm, ["ci"], {
    cwd: root,
    stdio: "inherit",
  });

  if (install.error) {
    console.error("[SP-API] Could not start npm ci:", install.error.message);
    process.exit(1);
  }

  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }

  writeFileSync(stampPath, lockHash + "\n");
} else {
  console.log("[SP-API] Dependencies are already up to date.");
}

console.log("[SP-API] Starting Next.js...");
const app = spawn(npm, ["run", "dev"], {
  cwd: root,
  stdio: "inherit",
});

app.on("error", (error) => {
  console.error("[SP-API] Could not start the app:", error.message);
  process.exit(1);
});

app.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => app.kill("SIGINT"));
process.on("SIGTERM", () => app.kill("SIGTERM"));
