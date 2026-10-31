import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isAllowedOrganization,
  isAllowedDestinationOrganization
} from "../netlify/functions/_shared.mjs";

test("recognizes the three configured organizations", () => {
  assert.equal(isAllowedOrganization("green-valley-farms"), true);
  assert.equal(isAllowedOrganization("freshroute-distribution"), true);
  assert.equal(isAllowedOrganization("harvest-market"), true);
});

test("rejects unrecognized organization IDs", () => {
  assert.equal(isAllowedOrganization("farm-a"), false);
  assert.equal(isAllowedOrganization("warehouse-b"), false);
  assert.equal(isAllowedOrganization("unknown-organization"), false);
});

test("only allows distribution and retail organizations as transfer destinations", () => {
  assert.equal(
    isAllowedDestinationOrganization("freshroute-distribution"),
    true
  );
  assert.equal(
    isAllowedDestinationOrganization("harvest-market"),
    true
  );

  assert.equal(
    isAllowedDestinationOrganization("green-valley-farms"),
    false
  );
  assert.equal(
    isAllowedDestinationOrganization("unknown-organization"),
    false
  );
});