
import { Contract, JsonRpcProvider } from "ethers";
import { json, validateText } from "./_shared.mjs";

const ABI = [
  "function getBatch(string batchId) view returns (tuple(string productName,string origin,string currentLocation,string status,uint256 createdAt,bool exists))",
  "function getTransferHistory(string batchId) view returns (tuple(string fromLocation,string toLocation,string status,uint256 timestamp,address recordedBy)[])"
];

export default async function handler(request) {
  if (request.method !== "GET") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const url = new URL(request.url);
    const batchId = validateText(url.searchParams.get("batchId"), "Batch ID", 80);

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const address = process.env.TRACE_LAYER_CONTRACT_ADDRESS;

    if (!rpcUrl || !address) {
      return json(503, { error: "Blockchain read configuration is incomplete." });
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();

    if (network.chainId !== 11155111n) {
      return json(503, { error: "The configured RPC is not connected to Sepolia." });
    }

    const contract = new Contract(address, ABI, provider);

    let batch;
    let transfers;

    try {
      [batch, transfers] = await Promise.all([
        contract.getBatch(batchId),
        contract.getTransferHistory(batchId)
      ]);
    } catch (error) {
      const message = String(error?.shortMessage || error?.reason || error?.message || "");

      if (/batch does not exist|missing revert data|execution reverted/i.test(message)) {
        return json(404, { error: "No batch with that ID was found on Sepolia." });
      }

      throw error;
    }

    return json(200, {
      success: true,
      batch: {
        batchId,
        productName: batch.productName,
        origin: batch.origin,
        currentLocation: batch.currentLocation,
        status: batch.status,
        createdAt: batch.createdAt.toString(),
        exists: batch.exists
      },
      transfers: transfers.map((transfer) => ({
        fromLocation: transfer.fromLocation,
        toLocation: transfer.toLocation,
        status: transfer.status,
        timestamp: transfer.timestamp.toString(),
        recordedBy: transfer.recordedBy
      }))
    });
  } catch (error) {
    console.error("get-batch failed:", error?.message || error);
    return json(400, {
      error: "Could not retrieve this batch. Check the batch ID and Sepolia RPC configuration."
    });
  }
}
