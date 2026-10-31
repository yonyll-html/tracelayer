import { test } from "node:test";
import assert from "node:assert/strict";

import handler from "../netlify/functions/record-transfer.mjs";

const FARM = "green-valley-farms";
const DISTRIBUTOR = "freshroute-distribution";
const RETAILER = "harvest-market";

function createMockContract(overrides = {}) {
  const calls = [];

  const contract = {
    getBatch: async () => ({
      exists: true,
      currentCustodian: FARM
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
  return new Request(
    "https://example.test/.netlify/functions/record-transfer",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        batchId: "BATCH-001",
        destination: "FreshRoute Distribution",
        status: "In transit",
        newCustodian: DISTRIBUTOR,
        ...overrides
      })
    }
  );
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

test("allows a guest to record a transfer without an organization access code", async () => {
  const { response, body, calls } = await runHandler();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.fromOrganization, FARM);
  assert.equal(body.toOrganization, DISTRIBUTOR);
  assert.equal(body.transactionHash, "0xtesttransaction");

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "BATCH-001");
  assert.equal(calls[0][1], "guest");
  assert.equal(calls[0][2], FARM);
  assert.equal(calls[0][5], DISTRIBUTOR);
  assert.equal(calls[0][6], 0n);
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
    overrides: { newCustodian: DISTRIBUTOR },
    contractOverrides: {
      getBatch: async () => ({
        exists: true,
        currentCustodian: DISTRIBUTOR
      })
    }
  });

  assert.equal(response.status, 400);
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

test("rejects a batch with an unrecognized current custodian", async () => {
  const { response, calls } = await runHandler({
    contractOverrides: {
      getBatch: async () => ({
        exists: true,
        currentCustodian: "unknown-organization"
      })
    }
  });

  assert.equal(response.status, 409);
  assert.equal(calls.length, 0);
});

test("returns a conflict when the contract rejects a stale nonce", async () => {
  const { response, body } = await runHandler({
    contractOverrides: {
      recordTransfer: async () => {
        throw new Error("Invalid transfer nonce");
      }
    }
  });

  assert.equal(response.status, 409);
  assert.match(body.error, /batch changed/i);
});

test("rejects an invalid handoff status", async () => {
  const { response, calls } = await runHandler({
    overrides: { status: "Unknown status" }
  });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});