import { test } from "node:test";
import assert from "node:assert/strict";

import handler from "../netlify/functions/record-transfer.mjs";

const envNames = [
  "TRACKNYLL_CODE_TRACKNYLL_DEMO",
  "TRACKNYLL_CODE_FARM_A",
  "TRACKNYLL_CODE_WAREHOUSE_B"
];

const originalValues = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]])
);

for (const name of envNames) {
  delete process.env[name];
}

process.env.TRACKNYLL_CODE_FARM_A = "farm-test-code";
process.env.TRACKNYLL_CODE_WAREHOUSE_B = "warehouse-test-code";

function createMockContract(overrides = {}) {
  const calls = [];

  const contract = {
    getBatch: async () => ({
      exists: true,
      currentCustodian: "farm-a"
    }),

    transferNonces: async () => 0n,

    recordTransfer: async (...args) => {
      calls.push(args);

      return {
        hash: "0xtesttransaction",
        wait: async () => ({ blockNumber: 123 })
      };
    },

    ...overrides
  };

  return { contract, calls };
}

function createRequest(overrides = {}) {
  return new Request("https://example.test/.netlify/functions/record-transfer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      batchId: "BATCH-001",
      destination: "Warehouse B",
      status: "In transit",
      newCustodian: "warehouse-b",
      organizationCode: "farm-test-code",
      ...overrides
    })
  });
}

async function runHandler({ overrides, contractOverrides } = {}) {
  const { contract, calls } = createMockContract(contractOverrides);

  const response = await handler(
    createRequest(overrides),
    { ip: `test-${Math.random()}` },
    {
      getWriteContract: async () => ({ contract })
    }
  );

  return {
    response,
    body: await response.json(),
    calls
  };
}

test("rejects an incorrect organization access code", async () => {
  const { response, body, calls } = await runHandler({
    overrides: { organizationCode: "wrong-code" }
  });

  assert.equal(response.status, 401);
  assert.equal(body.error, "Invalid organization access code.");
  assert.equal(calls.length, 0);
});

test("rejects an organization that is not the current custodian", async () => {
  const { response, body, calls } = await runHandler({
    overrides: { organizationCode: "warehouse-test-code" }
  });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test("rejects an unrecognized destination organization", async () => {
  const { response, calls } = await runHandler({
    overrides: { newCustodian: "unknown-organization" }
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("rejects transferring custody to the current custodian", async () => {
  const { response, calls } = await runHandler({
    overrides: { newCustodian: "farm-a" }
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("records a valid handoff for the current custodian", async () => {
  const { response, body, calls } = await runHandler();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.fromOrganization, "farm-a");
  assert.equal(body.toOrganization, "warehouse-b");
  assert.equal(body.transactionHash, "0xtesttransaction");
  assert.equal(body.blockNumber, 123);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "BATCH-001");
  assert.equal(calls[0][1], "farm-a");
  assert.equal(calls[0][5], "warehouse-b");
  assert.equal(calls[0][6], 0n);
});

test("returns a conflict when the contract rejects a stale nonce", async () => {
  const { response, body, calls } = await runHandler({
    contractOverrides: {
      recordTransfer: async () => {
        throw new Error("Invalid transfer nonce");
      }
    }
  });

  assert.equal(response.status, 409);
  assert.match(body.error, /batch changed/i);
  assert.equal(calls.length, 0);
});

test("rejects a transfer when the batch does not exist", async () => {
  const { response, calls } = await runHandler({
    contractOverrides: {
      getBatch: async () => ({
        exists: false,
        currentCustodian: ""
      })
    }
  });

  assert.equal(response.status, 404);
  assert.equal(calls.length, 0);
});

test.after(() => {
  for (const name of envNames) {
    if (originalValues[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValues[name];
    }
  }
});
