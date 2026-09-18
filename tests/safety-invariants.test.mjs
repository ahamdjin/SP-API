import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spApi = readFileSync(new URL("../src/lib/sp-api.ts", import.meta.url), "utf8");
const catalogRoute = readFileSync(new URL("../src/app/api/sp-api/catalog/route.ts", import.meta.url), "utf8");
const feesRoute = readFileSync(new URL("../src/app/api/sp-api/fees/route.ts", import.meta.url), "utf8");
const operationsRoute = readFileSync(new URL("../src/app/api/sp-api/operations/route.ts", import.meta.url), "utf8");

test("non-GET SP-API calls use write-safe retry mode", () => {
  assert.match(spApi, /method === "GET" \? "read" : "write"/);
  assert.match(spApi, /if \(status === 429\) return true;/);
  assert.match(spApi, /\[500, 502, 503, 504\]\.includes\(status\)\) return retryMode !== "write"/);
});

test("unknown internal failures are not advertised as safe to retry", () => {
  const section = spApi.slice(spApi.indexOf('code: "CLIENT_INTERNAL_ERROR"'), spApi.indexOf("export const privateHeaders"));
  assert.match(section, /retryable: false/);
});

test("sandbox fixture values are guidance only, not backend substitutions", () => {
  const backend = [catalogRoute, feesRoute, operationsRoute].join("\n");
  const fixtureValues = [
    "B07N4M94X4",
    "ID323",
    "feedId1",
    "wf1234abcd-1234-abcd-5678-1234abcd5678",
    "348975493",
    "0356cf79-b8b0-4226-b4b9-0ee058ea5760",
    "samsung,tv",
  ];

  for (const fixture of fixtureValues) {
    assert.equal(backend.includes(fixture), false, fixture + " must not be hard-coded into backend request execution");
  }
  assert.equal(catalogRoute.includes('environment === "sandbox"'), false);
  assert.equal(feesRoute.includes('environment === "sandbox"'), false);
});
