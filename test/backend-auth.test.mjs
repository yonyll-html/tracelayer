import {
  test,
  beforeEach,
  afterEach
} from "node:test";

import assert from "node:assert/strict";

import {
  getOrganizationForCode,
  isAllowedOrganization
} from "../netlify/functions/_shared.mjs";

const envNames = [
  "TRACKNYLL_CODE_TRACKNYLL_DEMO",
  "TRACKNYLL_CODE_FARM_A",
  "TRACKNYLL_CODE_WAREHOUSE_B"
];

const originalValues = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]])
);

beforeEach(() => {
  for (const name of envNames) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of envNames) {
    if (originalValues[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValues[name];
    }
  }
});

test("identifies Tracknyll Demo from its access code", () => {
  process.env.TRACKNYLL_CODE_TRACKNYLL_DEMO = "demo-test-code";

  assert.equal(
    getOrganizationForCode("demo-test-code"),
    "tracknyll-demo"
  );
});

test("identifies Farm A from its access code", () => {
  process.env.TRACKNYLL_CODE_FARM_A = "farm-test-code";

  assert.equal(
    getOrganizationForCode("farm-test-code"),
    "farm-a"
  );
});

test("identifies Warehouse B from its access code", () => {
  process.env.TRACKNYLL_CODE_WAREHOUSE_B = "warehouse-test-code";

  assert.equal(
    getOrganizationForCode("warehouse-test-code"),
    "warehouse-b"
  );
});

test("rejects an incorrect access code", () => {
  process.env.TRACKNYLL_CODE_FARM_A = "farm-test-code";

  assert.equal(getOrganizationForCode("wrong-code"), null);
});

test("rejects a missing access code", () => {
  assert.equal(getOrganizationForCode(""), null);
  assert.equal(getOrganizationForCode(null), null);
});

test("only recognizes configured organization IDs", () => {
  assert.equal(isAllowedOrganization("tracknyll-demo"), true);
  assert.equal(isAllowedOrganization("farm-a"), true);
  assert.equal(isAllowedOrganization("warehouse-b"), true);
  assert.equal(isAllowedOrganization("unknown-organization"), false);
});
