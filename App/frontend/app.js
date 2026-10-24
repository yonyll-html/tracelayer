
const API = {
  register: "/.netlify/functions/register-batch",
  transfer: "/.netlify/functions/record-transfer",
  track: "/.netlify/functions/get-batch"
};

const connectButton = document.querySelector("#connectButton");
const walletStatus = document.querySelector("#walletStatus");
const notice = document.querySelector("#notice");
const batchResult = document.querySelector("#batchResult");

function showNotice(message, type = "info") {
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function readableError(error) {
  const message = error?.message || "An unexpected error occurred.";

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Could not reach Netlify. Check that the latest deployment is published.";
  }
  if (/batch already exists/i.test(message)) {
    return "That batch ID already exists. Choose a unique ID.";
  }
  if (/batch does not exist|no batch with that id/i.test(message)) {
    return "Batch not found on Sepolia. Check the batch ID.";
  }
  if (/not an authorized recorder/i.test(message)) {
    return "The backend wallet is not authorized to record updates.";
  }
  if (/insufficient funds/i.test(message)) {
    return "The backend wallet may need more Sepolia test ETH.";
  }

  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
}

function getExplorerUrl(hash) {
  return `https://sepolia.etherscan.io/tx/${encodeURIComponent(hash)}`;
}

function formatTimestamp(value) {
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString();
}

function getTransactionHash(result) {
  return result.transactionHash ||
    result.txHash ||
    result.hash ||
    result.transaction?.hash ||
    null;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();

  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Unexpected server response (HTTP ${response.status}).`);
  }

  if (!response.ok || result.error || result.success === false) {
    throw new Error(
      result.error || result.message || `Request failed (HTTP ${response.status}).`
    );
  }

  return result;
}

function postJson(url, payload) {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function withButtonBusy(form, callback) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Working…";

  try {
    await callback();
  } catch (error) {
    showNotice(readableError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderTransactionResult(title, hash, details = "") {
  batchResult.hidden = false;

  const link = hash
    ? `<p><a href="${getExplorerUrl(hash)}" target="_blank" rel="noopener noreferrer">View transaction on Sepolia Etherscan ↗</a></p>`
    : "";

  batchResult.innerHTML = `
    <div class="result-top">
      <div>
        <div class="result-kicker">SEPOLIA TRANSACTION</div>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <span class="status-chip">Sepolia</span>
    </div>
    ${details ? `<p>${escapeHtml(details)}</p>` : ""}
    ${link}
  `;
}

// Writes are sent through the Netlify backend.
if (connectButton) {
  connectButton.textContent = "Backend mode";
}
if (walletStatus) {
  walletStatus.textContent = "Writes use the server wallet";
}
connectButton?.addEventListener("click", () => {
  showNotice(
    "Tracknyll uses its Netlify backend to submit transactions. A browser wallet connection is not required.",
    "info"
  );
});

// Register a batch.
document.querySelector("#registerForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);
  const payload = {
    batchId: String(data.get("batchId") || "").trim(),
    productName: String(data.get("productName") || "").trim(),
    origin: String(data.get("origin") || "").trim()
  };

  if (!payload.batchId || !payload.productName || !payload.origin) {
    showNotice("Complete all registration fields.", "error");
    return;
  }

  await withButtonBusy(form, async () => {
    showNotice("Registering batch on Sepolia…");

    const result = await postJson(API.register, payload);
    const hash = getTransactionHash(result);

    document.querySelector("#lookupBatchId").value = payload.batchId;
    document.querySelector("#transferBatchId").value = payload.batchId;
    form.reset();

    renderTransactionResult(
      "Batch registration confirmed by backend",
      hash,
      `Batch ID: ${payload.batchId}`
    );

    showNotice(
      "Registration request succeeded. Check the transaction receipt for its on-chain status.",
      "success"
    );
  });
});

// Record a handoff.
// IMPORTANT: the backend expects "destination", not "toLocation".
document.querySelector("#transferForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = new FormData(form);
  const payload = {
    batchId: String(data.get("transferBatchId") || "").trim(),
    destination: String(data.get("destination") || "").trim(),
    status: String(data.get("transferStatus") || "").trim()
  };

  if (!payload.batchId || !payload.destination || !payload.status) {
    showNotice("Complete all handoff fields.", "error");
    return;
  }

  await withButtonBusy(form, async () => {
    showNotice("Recording handoff on Sepolia…");

    const result = await postJson(API.transfer, payload);
    const hash = getTransactionHash(result);

    document.querySelector("#lookupBatchId").value = payload.batchId;
    form.reset();

    renderTransactionResult(
      "Handoff transaction submitted",
      hash,
      `Batch: ${payload.batchId} · Destination: ${payload.destination} · Status: ${payload.status}`
    );

    showNotice(
      "Handoff request succeeded. Verify the transaction receipt, then track the batch to see its updated history.",
      "success"
    );
  });
});

// Read batch details and transfer history from the backend.
document.querySelector("#trackForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const batchId = String(
    new FormData(form).get("lookupBatchId") || ""
  ).trim();

  if (!batchId) {
    showNotice("Enter a batch ID to track.", "error");
    return;
  }

  await withButtonBusy(form, async () => {
    showNotice("Loading batch history from Sepolia…");

    const url = `${API.track}?batchId=${encodeURIComponent(batchId)}`;
    const result = await requestJson(url);
    const batch = result.batch;
    const transfers = Array.isArray(result.transfers) ? result.transfers : [];

    if (!batch) {
      throw new Error("The tracking endpoint returned no batch details.");
    }

    const transferMarkup = transfers.length
      ? transfers.map((transfer, index) => `
          <article class="history-item">
            <div class="result-kicker">HANDOFF ${index + 1}</div>
            <h4>${escapeHtml(transfer.fromLocation)} → ${escapeHtml(transfer.toLocation)}</h4>
            <p><strong>Status:</strong> ${escapeHtml(transfer.status)}</p>
            <p><strong>Recorded:</strong> ${escapeHtml(formatTimestamp(transfer.timestamp))}</p>
            <p><strong>Recorder:</strong> <code>${escapeHtml(transfer.recordedBy)}</code></p>
          </article>
        `).join("")
      : `<p class="empty-history">No handoffs have been recorded for this batch yet.</p>`;

    batchResult.hidden = false;
    batchResult.innerHTML = `
      <div class="result-top">
        <div>
          <div class="result-kicker">BATCH TRACKING · SEPOLIA</div>
          <h3>${escapeHtml(batch.batchId || batchId)}</h3>
        </div>
        <span class="status-chip">${escapeHtml(batch.status)}</span>
      </div>

      <div class="batch-summary">
        <p><strong>Product:</strong> ${escapeHtml(batch.productName)}</p>
        <p><strong>Origin:</strong> ${escapeHtml(batch.origin)}</p>
        <p><strong>Current location:</strong> ${escapeHtml(batch.currentLocation)}</p>
        <p><strong>Registered:</strong> ${escapeHtml(formatTimestamp(batch.createdAt))}</p>
      </div>

      <h4>Journey history (${transfers.length} handoff${transfers.length === 1 ? "" : "s"})</h4>
      <div class="history-list">${transferMarkup}</div>
    `;

    showNotice(`Loaded batch ${batchId} from Sepolia.`, "success");
  });
});
