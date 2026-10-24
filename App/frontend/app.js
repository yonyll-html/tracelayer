
const API = {
  register: "/.netlify/functions/register-batch",
  transfer: "/.netlify/functions/record-transfer"
};

const SEPOLIA_CHAIN_ID = 11155111;

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
    error?.message ||
    "An unexpected error occurred.";

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Could not reach the Netlify function. Check the deployment and try again.";
  }

  if (/batch already exists/i.test(message)) {
    return "That batch ID already exists. Choose a unique ID.";
  }

  if (/batch does not exist/i.test(message)) {
    return "That batch was not found. Check the batch ID.";
  }

  if (/not an authorized recorder/i.test(message)) {
    return "The backend wallet is not authorized to record updates.";
  }

  if (/insufficient funds/i.test(message)) {
    return "The backend wallet may need more Sepolia test ETH.";
  }

  return message.length > 240
    ? `${message.slice(0, 240)}…`
    : message;
}

function getExplorerUrl(hash) {
  return `https://sepolia.etherscan.io/tx/${encodeURIComponent(hash)}`;
}

function renderTransactionResult(message, hash) {
  batchResult.hidden = false;

  const link = hash
    ? `<p><a href="${getExplorerUrl(hash)}" target="_blank" rel="noopener noreferrer">View transaction on Sepolia Etherscan ↗</a></p>`
    : "";

  batchResult.innerHTML = `
    <div class="result-top">
      <div>
        <div class="result-kicker">TRANSACTION STATUS</div>
        <h3>${escapeHtml(message)}</h3>
      </div>
      <span class="status-chip">Sepolia</span>
    </div>
    ${link}
    <p class="empty-history">
      This confirms the function returned successfully. Open the transaction
      link to inspect its on-chain status and receipt.
    </p>
  `;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();

  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `The server returned an unexpected response (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
      result.message ||
      `Request failed with HTTP ${response.status}.`
    );
  }

  if (result.success === false || result.error) {
    throw new Error(result.error || result.message);
  }

  return result;
}

function getTransactionHash(result) {
  return (
    result.transactionHash ||
    result.txHash ||
    result.hash ||
    result.transaction?.hash ||
    null
  );
}

async function withButtonBusy(form, callback) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Submitting…";

  try {
    await callback();
  } catch (error) {
    showNotice(readableError(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

// Backend-mediated writes do not require a browser wallet connection.
connectButton.textContent = "Backend mode";
walletStatus.textContent = "Writes use the server wallet";

connectButton.addEventListener("click", () => {
  showNotice(
    "Tracknyll submits writes through its Netlify backend. A browser wallet connection is not required for these operations.",
    "info"
  );
});

// Register a batch.
document
  .querySelector("#registerForm")
  .addEventListener("submit", async (event) => {
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
      showNotice("Submitting batch registration to Sepolia…");

      const result = await postJson(API.register, payload);
      const hash = getTransactionHash(result);

      document.querySelector("#lookupBatchId").value = payload.batchId;
      form.reset();

      renderTransactionResult(
        hash ? "Registration submitted" : "Registration request accepted",
        hash
      );

      showNotice(
        hash
          ? "The registration request was accepted. Check its transaction receipt for confirmation."
          : "The server accepted the request, but did not return a recognizable transaction hash.",
        hash ? "success" : "info"
      );
    });
  });

// Record a handoff.
document
  .querySelector("#transferForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const data = new FormData(form);

    const payload = {
      batchId: String(data.get("transferBatchId") || "").trim(),
      toLocation: String(data.get("destination") || "").trim(),
      status: String(data.get("transferStatus") || "").trim()
    };

    if (!payload.batchId || !payload.toLocation || !payload.status) {
      showNotice("Complete all handoff fields.", "error");
      return;
    }

    await withButtonBusy(form, async () => {
      showNotice("Submitting handoff to Sepolia…");

      const result = await postJson(API.transfer, payload);
      const hash = getTransactionHash(result);

      document.querySelector("#lookupBatchId").value = payload.batchId;
      form.reset();

      renderTransactionResult(
        hash ? "Handoff submitted" : "Handoff request accepted",
        hash
      );

      showNotice(
        hash
          ? "The handoff request was accepted. Check its transaction receipt for confirmation."
          : "The server accepted the request, but did not return a recognizable transaction hash.",
        hash ? "success" : "info"
      );
    });
  });

// Tracking requires a read endpoint. The current backend only provides writes.
document
  .querySelector("#trackForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const batchId = String(
      new FormData(event.currentTarget).get("lookupBatchId") || ""
    ).trim();

    if (!batchId) {
      showNotice("Enter a batch ID to track.", "error");
      return;
    }

    batchResult.hidden = false;
    batchResult.innerHTML = `
      <div class="result-top">
        <div>
          <div class="result-kicker">TRACKING NOT CONFIGURED</div>
          <h3>${escapeHtml(batchId)}</h3>
        </div>
      </div>
      <p class="empty-history">
        The frontend is connected to the Netlify backend, but a read endpoint
        for retrieving batch details and journey history has not been configured.
        No tracking history can be displayed yet.
      </p>
    `;

    showNotice(
      "Batch lookup needs a read-only backend function. Registration and handoff use separate endpoints.",
      "info"
    );
  });
