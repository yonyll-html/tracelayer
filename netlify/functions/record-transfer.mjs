import {
  json,
  parseBody,
  validateText,
  validateRequest,
  getWriteContract,
  ALLOWED_STATUSES
} from "./_shared.mjs";

export default async function handler(request, context) {
  const rejected = validateRequest(request, context);
  if (rejected) return rejected;

  try {
    const body = await parseBody(request);

    const batchId = validateText(body.batchId, "Batch ID", 80);
    const destination = validateText(body.destination, "Destination", 120);
    const status = validateText(body.status, "Status", 40);

    if (!ALLOWED_STATUSES.has(status)) {
      return json(400, { error: "Choose a valid handoff status." });
    }

    const { contract } = await getWriteContract();

    const tx = await contract.recordTransfer(batchId, destination, status);
    const receipt = await tx.wait();

    return json(200, {
      success: true,
      message: "Handoff recorded on Sepolia.",
      batchId,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    const message = String(error?.shortMessage || error?.reason || error?.message || "");

    if (message.includes("Batch does not exist")) {
      return json(404, { error: "No batch with that ID was found on Sepolia." });
    }

    if (message.includes("insufficient funds")) {
      return json(503, { error: "The backend wallet needs more Sepolia test ETH." });
    }

    console.error("record-transfer failed:", message);
    return json(400, {
      error: "Handoff recording failed. Check the batch details and backend configuration."
    });
  }
}
