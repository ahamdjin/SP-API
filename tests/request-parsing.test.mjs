import assert from "node:assert/strict";
import test from "node:test";

import { parseCsvFields, preserveIsoInstant } from "../src/lib/request-parsing.ts";

test("preserveIsoInstant keeps an exact UTC sandbox fixture timestamp", () => {
  assert.equal(
    preserveIsoInstant("2024-03-10T20:11:24.000Z"),
    "2024-03-10T20:11:24.000Z",
  );
});

test("preserveIsoInstant keeps an explicit numeric timezone", () => {
  assert.equal(
    preserveIsoInstant("2026-09-18T19:51:00+05:00"),
    "2026-09-18T19:51:00+05:00",
  );
});

test("preserveIsoInstant rejects timezone-less timestamps", () => {
  assert.equal(preserveIsoInstant("2026-09-18T19:51:00"), null);
});

test("preserveIsoInstant rejects invalid calendar values", () => {
  assert.equal(preserveIsoInstant("2026-13-40T25:61:00Z"), null);
});

test("parseCsvFields parses ordinary inbound item rows", () => {
  assert.deepEqual(
    parseCsvFields("MY-SKU-001, 2, SELLER, AMAZON"),
    ["MY-SKU-001", "2", "SELLER", "AMAZON"],
  );
});

test("parseCsvFields preserves commas inside quoted MSKUs", () => {
  assert.deepEqual(
    parseCsvFields('"SKU,WITH,COMMA", 2, SELLER, SELLER'),
    ["SKU,WITH,COMMA", "2", "SELLER", "SELLER"],
  );
});

test("parseCsvFields supports escaped quote characters", () => {
  assert.deepEqual(
    parseCsvFields('"SKU""A", 1, SELLER, SELLER'),
    ['SKU"A', "1", "SELLER", "SELLER"],
  );
});

test("parseCsvFields rejects an unclosed quoted field", () => {
  assert.throws(
    () => parseCsvFields('"SKU,WITH,COMMA, 2, SELLER, SELLER'),
    /Unclosed quoted CSV field/,
  );
});
