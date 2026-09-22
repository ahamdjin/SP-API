import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const port = 32124;
const url = `http://127.0.0.1:${port}/api/health`;
const output = [];

function npmStart() {
  if (isWindows) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm start"],
    };
  }
  return { command: "npm", args: ["start"] };
}

const npm = npmStart();
const child = spawn(npm.command, npm.args, {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  detached: !isWindows,
  stdio: ["ignore", "pipe", "pipe"],
});

function record(chunk, stream) {
  const text = chunk.toString();
  stream.write(text);
  output.push(text);
  if (output.length > 200) output.shift();
}

child.stdout.on("data", (chunk) => record(chunk, process.stdout));
child.stderr.on("data", (chunk) => record(chunk, process.stderr));

function stopTree() {
  if (!child.pid || child.exitCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 2 * 60 * 1000;
let healthy = false;

try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Production server exited early with code ${child.exitCode}.\n${output.join("")}`);
    }

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const body = await response.json();
        if (body?.status === "ok") {
          healthy = true;
          break;
        }
      }
    } catch {
      // Server is still starting.
    }

    await sleep(500);
  }

  if (!healthy) {
    throw new Error(`Timed out waiting for production health at ${url}.\n${output.join("")}`);
  }

  console.log(`[SP-API] Production startup health check passed at ${url}.`);
} finally {
  stopTree();
}
