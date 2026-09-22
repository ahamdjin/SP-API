import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spApi = readFileSync(new URL("../src/lib/sp-api.ts", import.meta.url), "utf8");
const catalogRoute = readFileSync(new URL("../src/app/api/sp-api/catalog/route.ts", import.meta.url), "utf8");
const feesRoute = readFileSync(new URL("../src/app/api/sp-api/fees/route.ts", import.meta.url), "utf8");
const operationsRoute = readFileSync(new URL("../src/app/api/sp-api/operations/route.ts", import.meta.url), "utf8");
const testRoute = readFileSync(new URL("../src/app/api/sp-api/test/route.ts", import.meta.url), "utf8");

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

test("production blocks Amazon's removed legacy listings feed types", () => {
  assert.match(operationsRoute, /REMOVED_LISTING_FEED_TYPE/);
  assert.match(operationsRoute, /POST_PRODUCT_DATA/);
  assert.match(operationsRoute, /input\.environment === "production"/);
  assert.match(operationsRoute, /JSON_LISTINGS_FEED/);
});


test("core SP-API request paths stay aligned with current Amazon models", () => {
  assert.match(testRoute, /\/sellers\/v1\/marketplaceParticipations/);

  const expectedPaths = [
    "/fba/inventory/v1/summaries",
    "/orders/2026-01-01/orders",
    "/reports/2021-06-30/reports",
    "/reports/2021-06-30/documents/",
    "/feeds/2021-06-30/feeds",
    "/feeds/2021-06-30/documents",
    "/inbound/fba/2024-03-20/inboundPlans",
    "/inbound/fba/2024-03-20/items/prepDetails",
    "/inbound/fba/2024-03-20/items/labels",
    "/inbound/fba/2024-03-20/operations/",
    "/fba/inbound/v0/shipments/",
  ];

  for (const path of expectedPaths) {
    assert.ok(operationsRoute.includes(path), "missing Amazon request path: " + path);
  }

  assert.match(catalogRoute, /\/catalog\/2022-04-01\/items/);
  assert.match(feesRoute, /\/products\/fees\/v0\//);
});

test("create report and create feed accept Amazon's current 25-marketplace maximum", () => {
  assert.match(
    operationsRoute,
    /csvValues\(optionalString\(fields, "reportMarketplaceIds"\), 25\)/,
  );
  assert.match(
    operationsRoute,
    /csvValues\(optionalString\(fields, "feedMarketplaceIds"\), 25\)/,
  );
});

test("list report and list feed filters keep Amazon's 10-marketplace maximum", () => {
  assert.match(operationsRoute, /csvValues\(optionalString\(fields, "reportMarketplaceIds"\), 10\)/);
  assert.match(operationsRoute, /csvValues\(optionalString\(fields, "feedMarketplaceIds"\), 10\)/);
});

test("Orders 2026 request enums and PII datasets remain current", () => {
  for (const value of [
    "PENDING_AVAILABILITY",
    "PENDING",
    "UNSHIPPED",
    "PARTIALLY_SHIPPED",
    "SHIPPED",
    "CANCELLED",
    "UNFULFILLABLE",
    "MERCHANT",
    "AMAZON",
    "BUYER",
    "RECIPIENT",
    "FULFILLMENT_ORDERS",
    "TAX",
    "PAYMENT",
  ]) {
    assert.ok(operationsRoute.includes(value), "missing Orders 2026 value: " + value);
  }
});

test("prep-details request preserves Amazon's required double encoding", () => {
  assert.match(operationsRoute, /replaceAll\("%", "%25"\)/);
  assert.match(operationsRoute, /replaceAll\("\+", "%2B"\)/);
  assert.match(operationsRoute, /replaceAll\(",", "%2C"\)/);
  assert.match(operationsRoute, /params\.append\("mskus"/);
});
