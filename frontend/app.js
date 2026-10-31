
const CONTRACT_ADDRESS = "0x963e99e283245fA2BD5538b42a53Ae552F3711c4";
const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

const walletStatus = document.querySelector("#walletStatus");
const notice = document.querySelector("#notice");
const batchResult = document.querySelector("#batchResult");
const registerForm = document.querySelector("#registerForm");
const transferForm = document.querySelector("#transferForm");
const trackForm = document.querySelector("#trackForm");

let readProvider;
let readContract;
let contractAbi;

function showNotice(message, type = "info") {
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
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
    error?.message ||
    "An unknown error occurred.";

  if (/insufficient funds/i.test(message)) {
    return "The shared backend wallet needs more Sepolia test ETH.";
  }

  if (/fetch|networkerror|econnrefused|timeout/i.test(message)) {
    return "Could not reach the service. Check your connection and try again.";
  }

  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

async function initializeReadAccess() {
  try {
    if (!ethers.isAddress(CONTRACT_ADDRESS)) {
      readContract = null;
      walletStatus.textContent =
        "Public demo · Shared backend wallet · Awaiting deployment";

      showNotice(
        "The public demo interface is ready. Blockchain lookup will become available after the new contract is deployed.",
        "info"
      );
      return;
    }

    const response = await fetch("./TraceLayer.json");

    if (!response.ok) {
      throw new Error("Could not load the contract ABI file.");
    }

    const artifact = await response.json();
    contractAbi = artifact.abi;

    readProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const network = await readProvider.getNetwork();

    if (network.chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error("The configured RPC is not connected to Sepolia.");
    }

    const code = await readProvider.getCode(CONTRACT_ADDRESS);

    if (code === "0x") {
      throw new Error("No contract was found at the configured Sepolia address.");
    }

    readContract = new ethers.Contract(
      CONTRACT_ADDRESS,
      contractAbi,
      readProvider
    );

    walletStatus.textContent =
      "Public demo · Shared backend wallet · Sepolia connected";

    showNotice(
      "Connected to the Tracknyll contract on Sepolia.",
      "success"
    );
  } catch (error) {
    readContract = null;
    walletStatus.textContent = "Public demo · Blockchain connection unavailable";
    showNotice(readableError(error), "error");
  }
}

async function sendBackendRequest(endpoint, payload) {
  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("The backend returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(result.error || "The backend request failed.");
  }

  return result;
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

// REGISTER A BATCH
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);

  await withButtonBusy(form, async () => {
    const payload = {
      batchId: data.get("batchId").trim(),
      productName: data.get("productName").trim(),
      origin: data.get("origin").trim()
    };

    showNotice("Submitting batch registration through the shared wallet…");

    const result = await sendBackendRequest("register-batch", payload);

    document.querySelector("#lookupBatchId").value = payload.batchId;
    form.reset();

    showNotice(
      `Batch registered. Transaction: ${result.transactionHash}`,
      "success"
    );

    if (readContract) {
      await lookupBatch(payload.batchId);
    }
  });
});

// RECORD A CUSTODY HANDOFF
transferForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);

  await withButtonBusy(form, async () => {
    const payload = {
      batchId: data.get("transferBatchId").trim(),
      destination: data.get("destination").trim(),
      status: data.get("transferStatus"),
      newCustodian: data.get("newCustodian").trim()
    };

    showNotice("Submitting custody handoff through the shared wallet…");

    const result = await sendBackendRequest("record-transfer", payload);

    document.querySelector("#lookupBatchId").value = payload.batchId;
    form.reset();

    showNotice(
      `Handoff recorded. New custodian: ${result.toOrganization}. Transaction: ${result.transactionHash}`,
      "success"
    );

    if (readContract) {
      await lookupBatch(payload.batchId);
    }
  });
});

// TRACK A BATCH
trackForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const batchId = new FormData(form).get("lookupBatchId").trim();

  await withButtonBusy(form, async () => {
    await lookupBatch(batchId);
  });
});

// LOOK UP BATCH AND HISTORY
async function lookupBatch(batchId) {
  if (!readContract) {
    throw new Error(
      "Public blockchain lookup is waiting for the new Sepolia contract deployment."
    );
  }

  batchResult.hidden = false;
  batchResult.innerHTML = '<p class="empty-history">Loading batch history…</p>';

  try {
    const [batch, transfers, nonce] = await Promise.all([
      readContract.getBatch(batchId),
      readContract.getTransferHistory(batchId),
      readContract.transferNonces(batchId)
    ]);

    if (!batch.exists) {
      throw new Error("No batch with that ID was found on Sepolia.");
    }

    const createdAt = new Date(Number(batch.createdAt) * 1000);

    const historyItems = transfers.map((transfer) => {
      const time = new Date(Number(transfer.timestamp) * 1000);

      return `
        <article class="history-item">
          <div class="history-marker"></div>
          <div>
            <div class="history-route">
              ${escapeHtml(transfer.fromLocation)} → ${escapeHtml(transfer.toLocation)}
            </div>
            <div class="history-meta">
              ${escapeHtml(transfer.status)} · ${escapeHtml(time.toLocaleString())}
            </div>
            <div class="history-meta">
              Recorded by: Shared Tracknyll wallet
            </div>
            <div class="history-meta">
              Custody: ${escapeHtml(transfer.fromCustodian)}
              → ${escapeHtml(transfer.toCustodian)}
            </div>
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
          <span class="detail-label">Current custodian</span>
          <span class="detail-value">${escapeHtml(batch.currentCustodian)}</span>
        </div>

        <div class="detail-cell">
          <span class="detail-label">Transfer nonce</span>
          <span class="detail-value">${escapeHtml(nonce.toString())}</span>
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
            <div class="history-route">
              ${escapeHtml(batch.origin)} · Batch registered
            </div>
            <div class="history-meta">
              ${escapeHtml(createdAt.toLocaleString())}
            </div>
          </div>
        </article>

        ${historyItems || '<p class="empty-history">No transfers have been recorded for this batch yet.</p>'}
      </div>`;

    showNotice(
      `Loaded batch ${batchId} from the Sepolia testnet.`,
      "success"
    );
  } catch (error) {
    batchResult.hidden = true;
    throw error;
  }
}

// INITIALIZE THE APPLICATION
async function initializeApp() {
  walletStatus.textContent =
    "Public demo · Shared backend wallet · Connecting…";

  await initializeReadAccess();
}

initializeApp();
