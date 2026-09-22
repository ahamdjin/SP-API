import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 32123;
const url = `http://127.0.0.1:${port}/api/health`;
const isWindows = process.platform === "win32";
const output = [];

const child = spawn(process.execPath, [resolve(root, "scripts", "start-vs2019.js")], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    SP_API_NO_BROWSER: "1",
  },
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
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 4 * 60 * 1000;
let healthy = false;

try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Visual Studio startup exited early with code ${child.exitCode}.`);
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
    throw new Error(`Timed out waiting for ${url}.\n${output.join("")}`);
  }

  const combinedOutput = output.join("");
  if (process.env.SP_API_EXPECT_INSTALL === "1" && !combinedOutput.includes("[SP-API] Dependencies installed successfully.")) {
    throw new Error("Expected a fresh dependency install, but the launcher did not report a completed install.");
  }
  if (process.env.SP_API_EXPECT_DEPENDENCIES_READY === "1" && !combinedOutput.includes("[SP-API] Dependencies are already up to date.")) {
    throw new Error("Expected the second launch to reuse installed dependencies, but it did not.");
  }

  console.log(`[SP-API] Startup health check passed at ${url}.`);
} finally {
  stopTree();
}
