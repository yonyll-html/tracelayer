import {
  json,
  parseBody,
  validateText,
  validateRequest,
  getWriteContract
} from "./_shared.mjs";

export default async function handler(request, context) {
  const rejected = validateRequest(request, context);
  if (rejected) return rejected;

  try {
    const body = await parseBody(request);

    const batchId = validateText(body.batchId, "Batch ID", 80);
    const productName = validateText(body.productName, "Product name", 120);
    const origin = validateText(body.origin, "Origin", 120);

    const { provider, wallet, contract } = await getWriteContract();

    const balance = await provider.getBalance(wallet.address);
    const feeData = await provider.getFeeData();

    if (balance === 0n || !feeData.gasPrice) {
      return json(503, {
        error: "The backend wallet has no usable Sepolia test ETH or fee data is unavailable."
      });
    }

    const tx = await contract.registerBatch(batchId, productName, origin);
    const receipt = await tx.wait();

    return json(200, {
      success: true,
      message: "Batch registered on Sepolia.",
      batchId,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    const message = String(error?.shortMessage || error?.reason || error?.message || "");

    if (message.includes("Batch already exists")) {
      return json(409, { error: "That batch ID already exists." });
    }

    if (message.includes("insufficient funds")) {
      return json(503, { error: "The backend wallet needs more Sepolia test ETH." });
    }

    console.error("register-batch failed:", message);
    return json(400, {
      error: "Batch registration failed. Check the batch details and backend configuration."
    });
  }
}
