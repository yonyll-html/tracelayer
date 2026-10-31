# Tracknyll

**A blockchain-based supply-chain tracking prototype built with Solidity, Ethereum, and Netlify Functions.**

Tracknyll explores how blockchain can help organizations record and verify the movement of products across a supply chain. It allows users to register product batches, record custody transfers, and view a batch's tracking history.

The project is an educational prototype inspired by real-world blockchain supply-chain initiatives. It uses fictional organizations to demonstrate how the system works.

## Features

- **Batch registration:** Register products with a unique batch ID, product name, origin, and initial custodian.
- **Custody tracking:** Record transfers between recognized organizations.
- **Transfer history:** Retrieve a batch's journey, including locations, statuses, timestamps, and custodians.
- **Organization validation:** Restrict batch registration and transfers to recognized organizations.
- **Shared backend wallet:** Submit blockchain transactions through a backend relayer instead of requiring each visitor to connect a wallet.
- **Sepolia deployment:** Store tracking records on the Ethereum Sepolia test network.

## How It Works

Tracknyll demonstrates a sample supply-chain journey:

`Green Valley Farms → FreshRoute Distribution → Harvest Market`

These are fictional organizations used for demonstration purposes.

When a batch is registered, its initial information is stored in the TraceLayer smart contract. When custody changes, the backend submits a transaction that records the transfer and updates the batch's current location and custodian.

The information can then be retrieved from the blockchain to display the batch's journey.

## Architecture

Tracknyll has three main components:

| Component | Technology | Purpose |
|---|---|---|
| Frontend | HTML, CSS, JavaScript | User interface and batch tracking |
| Backend | Netlify Functions | Validate requests and submit transactions |
| Blockchain | Solidity, Ethereum Sepolia | Store batch and transfer records |

The frontend communicates with the backend, which interacts with the TraceLayer smart contract using ethers.js. A shared backend wallet acts as the authorized relayer.

## Tech Stack

- Solidity
- Hardhat 3
- JavaScript
- HTML and CSS
- ethers.js
- Netlify Functions
- Ethereum Sepolia

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- A configured Sepolia RPC endpoint
- A funded Sepolia wallet for deployment and backend transactions

### 1. Clone the repository

```bash
git clone https://github.com/yonyll-html/tracknyll.git
cd tracknyll
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file using the variable names expected by the backend and deployment scripts.

Configure the required Sepolia RPC URL, deployment account, backend relayer wallet, and contract address.

**Never commit `.env` files, private keys, or other credentials.**

### 4. Run the tests

```bash
npx hardhat test
```

### 5. Start the local application

```bash
npx netlify dev
```

Open the local URL printed in the terminal, usually:

```text
http://localhost:8888
```

## Smart Contract

The `TraceLayer.sol` contract handles:

- Batch registration
- Custody transfers
- Organization validation
- Transfer nonce tracking
- Batch retrieval
- Transfer history retrieval
- Authorized relayer management

Only the contract owner can change the authorized relayer. Blockchain updates must be submitted by that relayer.

## Testing

The project includes Solidity and backend tests covering batch registration, transfer validation, organization authorization, replay protection, and other expected behaviors.

The latest completed test run passed **38 tests**:

- 28 Solidity tests
- 10 backend tests

An end-to-end test also verified batch registration followed by two custody transfers on Sepolia.

## Limitations

Tracknyll is an educational prototype, not a production-ready supply-chain platform.

- The sample organizations are fictional.
- Blockchain records are publicly accessible on the Sepolia test network.
- The shared backend wallet centralizes transaction submission.
- Blockchain immutability does not guarantee that submitted information is accurate.
- The prototype has not undergone a professional security audit or real-world deployment trial.

## Project Motivation

Tracknyll was developed to explore whether blockchain can improve supply-chain transparency and verification compared with traditional databases.

The project helped demonstrate both the potential and limitations of blockchain when multiple organizations need to share records.

