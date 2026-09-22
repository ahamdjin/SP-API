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
const noBrowser = process.env.SP_API_NO_BROWSER === "1";
const minimumNode = { major: 20, minor: 9 };
const portableNodeVersion = "22.23.2";

function isSupportedNode(version) {
  const [major, minor] = version.split(".").map(Number);
  return Number.isInteger(major)
    && Number.isInteger(minor)
    && (major > minimumNode.major || (major === minimumNode.major && minor >= minimumNode.minor));
}

function portableNodePath() {
  const platform = process.arch === "arm64" ? "win-arm64" : process.arch === "ia32" ? "win-x86" : "win-x64";
  return resolve(root, ".sp-api-runtime", `node-v${portableNodeVersion}-${platform}`, "node.exe");
}

function provisionPortableNode() {
  if (!isWindows) return "";

  console.log(
    `[SP-API] Node.js ${process.versions.node} is older than Next.js requires. Installing a project-local Node.js ${portableNodeVersion} runtime...`,
  );

  const powershell = process.env.SystemRoot
    ? resolve(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";

  const provision = spawnSync(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve(root, "scripts", "ensure-node.ps1"),
      "-Architecture",
      process.arch,
    ],
    { cwd: root, stdio: "inherit" },
  );

  if (provision.error || provision.status !== 0 || !existsSync(portableNodePath())) {
    console.error("[SP-API] Automatic project-local Node.js setup failed.");
    if (provision.error) console.error("[SP-API]", provision.error.message);
    return "";
  }

  return portableNodePath();
}

if (!isSupportedNode(process.versions.node)) {
  const portableNode = process.env.SP_API_BOOTSTRAPPED_NODE === "1" ? "" : provisionPortableNode();

  if (portableNode) {
    const rerun = spawnSync(portableNode, [fileURLToPath(import.meta.url)], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, SP_API_BOOTSTRAPPED_NODE: "1" },
    });
    process.exit(rerun.status ?? 1);
  }

  console.error(
    `[SP-API] This app requires Node.js 20.9 or newer. Current version: ${process.versions.node}`,
  );
  console.error("[SP-API] Node.js 22 LTS is recommended.");
  process.exit(1);
}

function getChildEnv() {
  const env = { ...process.env };

  // Do not pass Visual Studio / VS Code debugger injection into npm and Next.js child processes.
  delete env.NODE_OPTIONS;
  delete env.VSCODE_INSPECTOR_OPTIONS;

  // Keep SSL verification enabled while also trusting certificates installed in Windows.
  if (isWindows) {
    env.NODE_USE_SYSTEM_CA = "1";
  }

  return env;
}

// Prefer npm bundled beside the Node executable so a project-local fallback runtime works without changing PATH.
function getNpmProcess(args) {
  const npmCli = resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(npmCli)) {
    return {
      command: process.execPath,
      args: [npmCli, ...args],
    };
  }

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

function runNpmSync(args, { capture = false } = {}) {
  const npm = getNpmProcess(args);
  return spawnSync(npm.command, npm.args, {
    cwd: root,
    env: getChildEnv(),
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function explainInstallFailure(result) {
  const output = [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean)
    .join("\n");

  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|CERT_UNTRUSTED/i.test(output)) {
    console.error("\n[SP-API] npm could not verify your network certificate.");
    console.error("[SP-API] Windows system certificates are already enabled for this launcher.");
    console.error("[SP-API] If this still fails, the company/network root CA is not trusted by Windows on this PC.");
    console.error("[SP-API] Ask IT to install the correct root CA, or configure npm with the approved CA file. Do not disable SSL verification.\n");
    return;
  }

  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED/i.test(output)) {
    console.error("\n[SP-API] npm could not reach the package registry. Check the internet/proxy connection and try again.\n");
  }
}

const lockHash = createHash("sha256")
  .update(readFileSync(lockPath))
  .digest("hex");

const installedHash = existsSync(stampPath)
  ? readFileSync(stampPath, "utf8").trim()
  : "";

if (!existsSync(nextPath) || installedHash !== lockHash) {
  console.log("[SP-API] Checking npm registry connection...");
  const registryCheck = runNpmSync(["ping", "--silent"], { capture: true });

  if (registryCheck.error || registryCheck.status !== 0) {
    if (registryCheck.stdout) process.stdout.write(registryCheck.stdout);
    if (registryCheck.stderr) process.stderr.write(registryCheck.stderr);
    explainInstallFailure(registryCheck);
    process.exit(registryCheck.status ?? 1);
  }

  console.log("[SP-API] Registry connection OK.");
  console.log("[SP-API] Installing npm dependencies for this repo...");
  const install = runNpmSync(["ci", "--no-audit", "--no-fund"]);

  if (install.error) {
    console.error("[SP-API] Could not start npm ci:", install.error.message);
    explainInstallFailure(install);
    process.exit(1);
  }

  if (install.status !== 0) {
    explainInstallFailure(install);
    process.exit(install.status ?? 1);
  }

  writeFileSync(stampPath, lockHash + "\n");
  console.log("[SP-API] Dependencies installed successfully.");
} else {
  console.log("[SP-API] Dependencies are already up to date.");
}

console.log("[SP-API] Starting Next.js...");
const npmDev = getNpmProcess(["run", "dev:visualstudio"]);
const app = spawn(npmDev.command, npmDev.args, {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
  env: getChildEnv(),
});

let browserOpened = false;

// Open the actual Next.js URL only after the dev server reports that it is ready.
function handleServerOutput(chunk, stream) {
  const text = chunk.toString();
  stream.write(text);

  if (browserOpened || noBrowser) return;

  const match = text.match(/Local:\s+(https?:\/\/[^\s]+)/i);
  if (!match) return;

  browserOpened = true;
  const url = match[1].replace(/\u001b\[[0-9;]*m/g, "");

  if (isWindows) {
    const browser = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
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
