const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const connectButton = document.querySelector("#connectButton");
const walletStatus = document.querySelector("#walletStatus");
const notice = document.querySelector("#notice");
const batchResult = document.querySelector("#batchResult");

let provider;
let signer;
let contract;
let contractAbi;

function showNotice(message, type = "info") {
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function readableError(error) {
  const message =
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.message ||
    "An unknown error occurred.";

  if (message.includes("Batch already exists")) {
    return "That batch ID already exists. Choose a unique ID.";
  }
  if (message.includes("Batch does not exist")) {
    return "No batch with that ID was found on this blockchain.";
  }
  if (message.includes("Not an authorized recorder")) {
    return "This local account is not authorized to record updates.";
  }
  if (message.includes("Only owner")) {
    return "Only the contract owner can perform that action.";
  }
  if (/fetch|networkerror|econnrefused/i.test(message)) {
    return "Cannot reach Hardhat. Check that the local blockchain is running.";
  }

  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

async function connectWallet() {
  try {
    const response = await fetch("./TraceLayer.json");
    if (!response.ok) {
      throw new Error("Could not load frontend/TraceLayer.json.");
    }

    const artifact = await response.json();
    contractAbi = artifact.abi;

    // Connect directly to the local Hardhat JSON-RPC server.
    provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    const network = await provider.getNetwork();
    if (network.chainId !== 31337n) {
      throw new Error(`Expected chain ID 31337, received ${network.chainId}.`);
    }

    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (code === "0x") {
      throw new Error(
        "TraceLayer is not deployed at the configured address. Redeploy the contract and update CONTRACT_ADDRESS if needed."
      );
    }

    // Hardhat's first account is for local development only.
    signer = await provider.getSigner(0);
    contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, signer);

    const address = await signer.getAddress();
    walletStatus.textContent = `Local test account: ${shortAddress(address)}`;
    connectButton.textContent = "Connected to Hardhat";

    showNotice(
      "Connected to the local blockchain. No MetaMask connection is required.",
      "success"
    );
  } catch (error) {
    contract = null;
    signer = null;
    showNotice(readableError(error), "error");
  }
}

async function requireContract() {
  if (!contract || !signer) {
    await connectWallet();
  }
  if (!contract || !signer) {
    throw new Error("Could not connect to the local blockchain.");
  }
  return contract;
}

async function withButtonBusy(form, callback) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Processing…";

  try {
    await callback();
  } catch (error) {
    showNotice(readableError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

document.querySelector("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  await withButtonBusy(form, async () => {
    const app = await requireContract();

    const batchId = data.get("batchId").trim();
    const tx = await app.registerBatch(
      batchId,
      data.get("productName").trim(),
      data.get("origin").trim()
    );

    showNotice(`Registration submitted: ${tx.hash}. Waiting for confirmation…`);
    await tx.wait();

    document.querySelector("#lookupBatchId").value = batchId;
    form.reset();
    showNotice(`Batch registered successfully. Transaction: ${tx.hash}`, "success");
    await lookupBatch(batchId);
  });
});

document.querySelector("#transferForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);

  await withButtonBusy(form, async () => {
    const app = await requireContract();
    const batchId = data.get("transferBatchId").trim();

    const tx = await app.recordTransfer(
      batchId,
      data.get("destination").trim(),
      data.get("transferStatus")
    );

    showNotice(`Handoff submitted: ${tx.hash}. Waiting for confirmation…`);
    await tx.wait();

    document.querySelector("#lookupBatchId").value = batchId;
    form.reset();
    showNotice(`Handoff recorded successfully. Transaction: ${tx.hash}`, "success");
    await lookupBatch(batchId);
  });
});

document.querySelector("#trackForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const batchId = new FormData(form).get("lookupBatchId").trim();

  await withButtonBusy(form, async () => {
    await requireContract();
    await lookupBatch(batchId);
  });
});

async function lookupBatch(batchId) {
  if (!contract) {
    throw new Error("Connect to Hardhat first.");
  }

  batchResult.hidden = false;
  batchResult.innerHTML = '<p class="empty-history">Loading batch history…</p>';

  try {
    const [batch, transfers] = await Promise.all([
      contract.getBatch(batchId),
      contract.getTransferHistory(batchId)
    ]);

    const createdAt = new Date(Number(batch.createdAt) * 1000);

    const historyItems = transfers.map((transfer) => {
      const time = new Date(Number(transfer.timestamp) * 1000);
      return `
        <article class="history-item">
          <div class="history-marker"></div>
          <div>
            <div class="history-route">${escapeHtml(transfer.fromLocation)} → ${escapeHtml(transfer.toLocation)}</div>
            <div class="history-meta">${escapeHtml(transfer.status)} · ${escapeHtml(time.toLocaleString())}</div>
            <div class="history-meta">Recorded by ${escapeHtml(transfer.recordedBy)}</div>
          </div>
        </article>`;
    }).join("");

    batchResult.innerHTML = `
      <div class="result-top">
        <div>
          <div class="result-kicker">TRACE RESULT</div>
          <h3>${escapeHtml(batch.productName)}</h3>
          <div class="result-id">BATCH / ${escapeHtml(batchId)}</div>
        </div>
        <span class="status-chip">${escapeHtml(batch.status)}</span>
      </div>
      <div class="details-grid">
        <div class="detail-cell">
          <span class="detail-label">Origin</span>
          <span class="detail-value">${escapeHtml(batch.origin)}</span>
        </div>
        <div class="detail-cell">
          <span class="detail-label">Current location</span>
          <span class="detail-value">${escapeHtml(batch.currentLocation)}</span>
        </div>
        <div class="detail-cell">
          <span class="detail-label">Registered</span>
          <span class="detail-value">${escapeHtml(createdAt.toLocaleString())}</span>
        </div>
      </div>
      <div class="history-heading">
        <h4>Journey history</h4>
        <span>${transfers.length} TRANSFER${transfers.length === 1 ? "" : "S"}</span>
      </div>
      <div class="history-list">
        <article class="history-item">
          <div class="history-marker"></div>
          <div>
            <div class="history-route">${escapeHtml(batch.origin)} · Batch registered</div>
            <div class="history-meta">${escapeHtml(createdAt.toLocaleString())}</div>
          </div>
        </article>
        ${historyItems || '<p class="empty-history">No transfers have been recorded for this batch yet.</p>'}
      </div>`;

    showNotice(`Loaded batch ${batchId} from the local blockchain.`, "success");
  } catch (error) {
    batchResult.hidden = true;
    throw error;
  }
}

connectButton.addEventListener("click", connectWallet);

