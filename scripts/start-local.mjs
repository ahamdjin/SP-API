import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = resolve(root, "package-lock.json");
const nextPath = resolve(root, "node_modules", "next", "package.json");
const stampPath = resolve(root, "node_modules", ".sp-api-lock-hash");
const isWindows = process.platform === "win32";

// Windows npm is a .cmd shim, so launch it through cmd.exe instead of spawning npm.cmd directly.
function getNpmProcess(args) {
  if (isWindows) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...args].join(" ")],
    };
  }

  return {
    command: "npm",
    args,
  };
}

const lockHash = createHash("sha256")
  .update(readFileSync(lockPath))
  .digest("hex");

const installedHash = existsSync(stampPath)
  ? readFileSync(stampPath, "utf8").trim()
  : "";

if (!existsSync(nextPath) || installedHash !== lockHash) {
  console.log("[SP-API] Installing npm dependencies for this repo...");
  const npmCi = getNpmProcess(["ci"]);
  const install = spawnSync(npmCi.command, npmCi.args, {
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
const npmDev = getNpmProcess(["run", "dev"]);
const app = spawn(npmDev.command, npmDev.args, {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
});

let browserOpened = false;

// Open the actual Next.js URL only after the dev server reports that it is ready.
function handleServerOutput(chunk, stream) {
  const text = chunk.toString();
  stream.write(text);

  if (browserOpened) return;

  const match = text.match(/Local:\s+(https?:\/\/[^\s]+)/i);
  if (!match) return;

  browserOpened = true;
  const url = match[1].replace(/\u001b\[[0-9;]*m/g, "");

  if (isWindows) {
    const browser = spawn(process.env.ComSpec || "cmd.exe", [
      "/d",
      "/s",
      "/c",
      `start "" "${url}"`,
    ], {
      detached: true,
      stdio: "ignore",
    });
    browser.unref();
  }
}

app.stdout.on("data", (chunk) => handleServerOutput(chunk, process.stdout));
app.stderr.on("data", (chunk) => handleServerOutput(chunk, process.stderr));

app.on("error", (error) => {
  console.error("[SP-API] Could not start the app:", error.message);
  process.exit(1);
});

app.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => app.kill("SIGINT"));
process.on("SIGTERM", () => app.kill("SIGTERM"));
