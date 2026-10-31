import {
  json,
  parseBody,
  validateText,
  validateRequest,
  getWriteContract,
  getOrganizationForCode,
  isAllowedOrganization,
  ALLOWED_STATUSES
} from "./_shared.mjs";

export default async function handler(request, context, dependencies = {}) {
  const rejected = validateRequest(request, context);
  if (rejected) return rejected;

  try {
    const body = await parseBody(request);

    const batchId = validateText(body.batchId, "Batch ID", 80);
    const destination = validateText(body.destination, "Destination", 120);
    const status = validateText(body.status, "Status", 40);
    const newCustodian = validateText(
      body.newCustodian,
      "New custodian organization",
      80
    );
    const organizationCode = validateText(
      body.organizationCode,
      "Organization access code",
      100
    );

    if (!ALLOWED_STATUSES.has(status)) {
      return json(400, { error: "Choose a valid handoff status." });
    }

    const authorizedOrganization =
      getOrganizationForCode(organizationCode);

    if (!authorizedOrganization) {
      return json(401, {
        error: "Invalid organization access code."
      });
    }

    if (!isAllowedOrganization(newCustodian)) {
      return json(400, {
        error: "Choose a recognized destination organization."
      });
    }

    const getContract = dependencies.getWriteContract || getWriteContract;
    const { contract } = await getContract();

    const batch = await contract.getBatch(batchId);

    if (!batch.exists) {
      return json(404, {
        error: "No batch with that ID was found on Sepolia."
      });
    }

    if (authorizedOrganization !== batch.currentCustodian) {
      return json(403, {
        error: "This access code is not authorized to transfer this batch."
      });
    }

    if (newCustodian === batch.currentCustodian) {
      return json(400, {
        error: "The new custodian must be different from the current custodian."
      });
    }

    const expectedNonce = await contract.transferNonces(batchId);

    const tx = await contract.recordTransfer(
      batchId,
      authorizedOrganization,
      batch.currentCustodian,
      destination,
      status,
      newCustodian,
      expectedNonce
    );

    const receipt = await tx.wait();

    return json(200, {
      success: true,
      message: "Handoff recorded on Sepolia.",
      batchId,
      fromOrganization: batch.currentCustodian,
      toOrganization: newCustodian,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    const message = String(
      error?.shortMessage || error?.reason || error?.message || ""
    );

    if (message.includes("Batch does not exist")) {
      return json(404, {
        error: "No batch with that ID was found on Sepolia."
      });
    }

    if (message.includes("insufficient funds")) {
      return json(503, {
        error: "The shared backend wallet needs more Sepolia test ETH."
      });
    }

    if (
      message.includes("Invalid transfer nonce") ||
      message.includes("Not the current custodian") ||
      message.includes("Already the current custodian")
    ) {
      return json(409, {
        error: "The batch changed before the handoff could be recorded. Refresh and try again."
      });
    }

    console.error("record-transfer failed:", message);

    return json(400, {
      error: "Handoff recording failed. Check the batch details and backend configuration."
    });
  }
}
