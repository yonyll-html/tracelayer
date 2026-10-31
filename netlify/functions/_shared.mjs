
import { Contract, JsonRpcProvider, Wallet } from "ethers";

export const CONTRACT_ADDRESS =
  process.env.TRACE_LAYER_CONTRACT_ADDRESS;

const ABI = [
  "function relayer() view returns (address)",
  "function getBatch(string batchId) view returns ((string productName, string origin, string currentLocation, string status, string currentCustodian, uint256 createdAt, bool exists))",
  "function registerBatch(string batchId, string productName, string origin, string custodianId)",
  "function recordTransfer(string batchId, string operatorId, string currentCustodian, string toLocation, string status, string newCustodian, uint256 expectedNonce)",
  "function transferNonces(string batchId) view returns (uint256)"
];

export const ALLOWED_STATUSES = new Set([
  "In transit",
  "Quality checked",
  "Received",
  "Processed",
  "Delivered"
]);

const rateLimits = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

export function json(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function validateText(value, name, maxLength) {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string.`);
  }

  const cleaned = value.trim();

  if (!cleaned) {
    throw new Error(`${name} is required.`);
  }

  if (cleaned.length > maxLength) {
    throw new Error(`${name} must be ${maxLength} characters or fewer.`);
  }

  return cleaned;
}

export function checkRateLimit(ip) {
  const now = Date.now();
  const previous = rateLimits.get(ip);

  if (previous && now - previous.start < WINDOW_MS) {
    if (previous.count >= MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    previous.count += 1;
  } else {
    rateLimits.set(ip, { start: now, count: 1 });
  }

  if (rateLimits.size > 1000) {
    for (const [key, value] of rateLimits) {
      if (now - value.start >= WINDOW_MS) {
        rateLimits.delete(key);
      }
    }
  }

  return true;
}

export async function parseBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error("Send the request as application/json.");
  }

  const raw = await request.text();

  if (raw.length > 4096) {
    throw new Error("Request body is too large.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

export async function getWriteContract() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.BACKEND_PRIVATE_KEY;

  if (!rpcUrl || !privateKey || !CONTRACT_ADDRESS) {
    throw new Error("Backend blockchain configuration is incomplete.");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  if (network.chainId !== 11155111n) {
    throw new Error("Backend RPC must connect to Sepolia.");
  }

  const wallet = new Wallet(privateKey, provider);

  const contract = new Contract(
    CONTRACT_ADDRESS,
    ABI,
    wallet
  );

  const authorizedRelayer = await contract.relayer();

  if (authorizedRelayer.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      "Backend wallet is not the contract's authorized relayer."
    );
  }

  return { provider, wallet, contract };
}

export function validateRequest(request, context) {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const ip = context.ip || "unknown";

  if (!checkRateLimit(ip)) {
    return json(429, {
      error: "Too many requests. Please wait a minute and try again."
    });
  }

  return null;
}
