# Tracknyll

**Blockchain-based supply-chain tracking and traceability.**

Tracknyll is a web application that demonstrates how blockchain technology can be used to record product origins, track supply-chain handoffs, and retrieve a product's recorded history. It uses a Solidity smart contract deployed to the Ethereum Sepolia test network, a JavaScript frontend, and Netlify serverless functions to interact with the blockchain.

The project explores how shared, tamper-resistant records can improve the traceability of products as they move through a supply chain.

> **Network:** Ethereum Sepolia testnet  
> **Status:** Functional prototype  
> **Purpose:** Educational and experimental

## Features

- **Batch registration:** Register a product batch with a unique batch ID, product name, and origin.
- **Supply-chain handoffs:** Record a batch's destination and updated status.
- **Batch tracking:** Retrieve a registered batch's current location, status, registration time, and recorded transfer history.
- **On-chain records:** Store batch information and transfer records in a deployed Solidity smart contract.
- **Transaction verification:** Verify blockchain transactions using their transaction hashes and a Sepolia block explorer.
- **Serverless backend:** Use Netlify Functions to submit blockchain transactions without exposing the backend wallet's private key to the browser.

## How it works

Tracknyll uses a smart contract as the shared record of a product's registered information and recorded movements.

1. **Register a batch.** A user submits a batch ID, product name, and origin through the frontend.
2. **Submit the transaction.** The frontend sends the registration request to a Netlify Function, which interacts with the smart contract using the backend wallet.
3. **Record a handoff.** A user submits a batch ID, destination, and status. The backend requests a transaction that records the transfer and updates the batch's current location and status.
4. **Track the batch.** The frontend requests the batch's information and transfer history from the read-only backend endpoint.
5. **Verify the records.** The transaction hashes and block numbers can be used to inspect the corresponding transactions on Sepolia.

Blockchain transactions must be included in a block before their changes become part of the chain's recorded state.

## Technology stack

| Technology | Purpose |
|---|---|
| HTML | Frontend structure |
| CSS | Interface styling |
| JavaScript | Frontend behavior and API requests |
| Solidity | Smart contract logic |
| Ethereum Sepolia | Blockchain test network |
| ethers.js | Ethereum provider and contract interactions |
| Netlify Functions | Serverless backend endpoints |
| Netlify | Frontend hosting and function deployment |
| GitHub | Source-code version control |

## Project structure

The repository is organized into the following relevant paths:

```text
tracknyll/
├── App/
│   ├── README.md
│   ├── frontend/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── style.css
│   ├── contracts/
│   │   └── TraceLayer.sol
│   └── hardhat.config.ts
├── netlify/
│   └── functions/
│       ├── _shared.mjs
│       ├── register-batch.mjs
│       ├── record-transfer.mjs
│       └── get-batch.mjs
├── netlify.toml
└── package.json
```

The root-level `netlify.toml` configures Netlify to publish `App/frontend` and load functions from `netlify/functions`. The root-level `package.json` declares the project's Node.js package configuration and dependencies.

## Smart contract

Tracknyll's smart contract is `TraceLayer.sol`.

**Deployed contract address:**

[`0x635Ccee6B979d02dF1f38E03831254BDC5D5A72d`](https://sepolia.etherscan.io/address/0x635Ccee6B979d02dF1f38E03831254BDC5D5A72d)

**Network:** Ethereum Sepolia

The contract maintains batch records, transfer histories, and authorization for accounts permitted to write records.

Its primary operations include:

- `registerBatch` — register a new product batch.
- `recordTransfer` — record a transfer and update the batch's current location and status.
- `getBatch` — retrieve a batch's current information.
- `getTransferCount` — retrieve the number of recorded transfers.
- `getTransferAt` — retrieve an individual transfer by index.
- `getTransferHistory` — retrieve a batch's transfer history.
- `setRecorderAuthorization` — authorize or revoke a recorder, restricted to the contract owner.

The contract prevents duplicate batch registration and rejects transfers for batches that do not exist. Write operations also require an authorized recorder.

## Backend architecture

The backend is implemented using Netlify Functions and ethers.js.

### Registration endpoint

`/.netlify/functions/register-batch`

Accepts a POST request containing:

```json
{
  "batchId": "BATCH-001",
  "productName": "Coffee Beans",
  "origin": "Farm A"
}
```

The function validates the request, submits a smart-contract transaction, waits for its receipt, and returns the transaction hash and block number.

### Transfer endpoint

`/.netlify/functions/record-transfer`

Accepts a POST request containing:

```json
{
  "batchId": "BATCH-001",
  "destination": "Processing Facility",
  "status": "In transit"
}
```

The destination is supplied using the `destination` field. The backend submits the transfer to the smart contract and returns the transaction result.

Supported transfer statuses are:

- `In transit`
- `Quality checked`
- `Received`
- `Processed`
- `Delivered`

### Batch tracking endpoint

`/.netlify/functions/get-batch?batchId=BATCH-001`

Accepts a GET request with a batch ID query parameter. It reads the batch information and transfer history from Sepolia and returns the data as JSON.

The read endpoint does not need a private key because the contract's read operations are publicly accessible.

## Configuration

The Netlify deployment requires the following environment variables:

| Variable | Purpose |
|---|---|
| `SEPOLIA_RPC_URL` | RPC endpoint used to communicate with Ethereum Sepolia |
| `BACKEND_PRIVATE_KEY` | Private key for the dedicated backend transaction wallet |
| `TRACE_LAYER_CONTRACT_ADDRESS` | Address of the deployed `TraceLayer` contract |

Configure these values through the Netlify site's environment-variable settings. Do not commit secret values to GitHub, embed them in frontend JavaScript, or include them in documentation.

The backend checks that its RPC connection is using Sepolia before submitting or retrieving blockchain data.

### Backend wallet requirements

The backend wallet must:

1. Have sufficient Sepolia test ETH to pay transaction gas fees.
2. Be authorized by the smart contract owner to submit registration and transfer transactions.
3. Remain separate from the contract owner's wallet where practical.

Sepolia test ETH has no monetary value and is intended for testing.

## Running and deployment

The deployed application uses Netlify for hosting and serverless functions.

For a deployment from GitHub:

1. Connect the repository to Netlify.
2. Ensure the root `netlify.toml` points to `App/frontend` as the publish directory and `netlify/functions` as the functions directory.
3. Configure the required environment variables in Netlify.
4. Deploy the application and verify that the frontend and serverless endpoints are available.

The repository also contains a Hardhat configuration for contract development. Local contract development or redeployment requires a compatible Node.js environment and the appropriate Hardhat dependencies and configuration.

**Important:** The existing deployed contract is already associated with its address on Sepolia. Redeploying a contract creates a different deployment address; updating the source file alone does not change the contract already deployed on the blockchain.

## Security considerations

Tracknyll is a prototype and should not be treated as a production supply-chain system.

- **Backend wallet security:** The backend private key must remain secret and be accessible only to the server-side functions that need it.
- **Public write endpoints:** The registration and transfer endpoints may be accessible to public visitors. Request validation and basic rate limiting do not replace robust authentication, authorization, abuse prevention, and operational monitoring.
- **Trusted inputs:** Blockchain records can make submitted data difficult to alter retroactively, but they cannot independently establish that the original information was accurate.
- **Testnet limitations:** Sepolia is a test network. Its transactions and test ETH are not equivalent to production transactions or assets on Ethereum mainnet.
- **Privacy:** Do not store sensitive personal information or confidential supply-chain data directly on a public blockchain.
- **Transaction costs:** Write operations require gas. The backend wallet must maintain an adequate test ETH balance for the application to continue submitting transactions.

Before broader public release, the backend should receive a more thorough security review, particularly for public write access and abuse prevention.

## Known limitations

- The application relies on the availability of its configured RPC provider and Netlify deployment.
- The prototype records information submitted by users; it does not automatically verify physical product movements.
- Blockchain data provides a record of submitted transactions, not proof that a real-world event happened as described.
- The current deployment is configured for Sepolia rather than Ethereum mainnet.
- The backend transaction wallet needs test ETH to perform write operations.

## Future possibilities

Potential future improvements include authenticated supply-chain participants, stronger abuse prevention, QR-code-based batch lookup, event-driven tracking updates, and integrations with physical tracking systems or verified supply-chain data sources.

These are possible extensions rather than claims about features already implemented.

## License

The smart contract source includes the MIT SPDX license identifier. A repository-wide license should be specified separately if the project is intended to be distributed under a particular license.
