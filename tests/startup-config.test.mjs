import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const launch = readFileSync(new URL("../.vscode/launch.json", import.meta.url), "utf8");
const vs2019 = readFileSync(new URL("../SP-API-VS2019.njsproj", import.meta.url), "utf8");
const vs2022 = readFileSync(new URL("../SP-API.esproj", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const launcher = readFileSync(new URL("../scripts/start-local.mjs", import.meta.url), "utf8");
const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("Visual Studio launch paths use the shared bootstrap", () => {
  assert.match(launch, /"type": "node"/);
  assert.match(launch, /scripts\/start-vs2019\.js/);
  assert.match(vs2019, /<StartupFile>scripts\\start-vs2019\.js<\/StartupFile>/);
  assert.match(vs2022, /<StartupCommand>npm run visualstudio<\/StartupCommand>/);
});

test("VS 2019 does not open the browser before Next.js is ready", () => {
  assert.match(vs2019, /<StartWebBrowser>false<\/StartWebBrowser>/);
  assert.match(launcher, /Local:\\s\+/);
  assert.match(launcher, /SP_API_NO_BROWSER/);
});

test("Visual Studio dev mode uses Webpack and keeps TLS verification enabled", () => {
  assert.equal(packageJson.scripts["dev:visualstudio"], "next dev --webpack");
  assert.match(launcher, /NODE_USE_SYSTEM_CA = "1"/);
  assert.doesNotMatch(launcher, /strict-ssl\s*=?\s*false/i);
  assert.doesNotMatch(launcher, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/);
});

test("dependency stamp is written only after npm ci succeeds", () => {
  const installStart = launcher.indexOf('const install = runNpmSync(["ci"');
  const installSuccessCheck = launcher.indexOf("if (install.status !== 0)", installStart);
  const stampWrite = launcher.indexOf("writeFileSync(stampPath", installStart);

  assert.ok(installStart >= 0);
  assert.ok(installSuccessCheck > installStart);
  assert.ok(stampWrite > installSuccessCheck);
  assert.doesNotMatch(launcher, /Existing npm dependencies found/);
});


test("CI exercises the exact ZIP-style Windows first-run and second-run paths", () => {
  assert.match(ci, /git archive --format=zip/);
  assert.match(ci, /SP_API_EXPECT_INSTALL/);
  assert.match(ci, /SP_API_EXPECT_DEPENDENCIES_READY/);
  assert.match(ci, /verify-production-start\.mjs/);
});
