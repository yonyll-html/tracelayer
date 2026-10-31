import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x8e1cb0586cCeFdD987eccb8F0195dE2474809370";
const BACKEND_ADDRESS = "0xef37bdD8F963d3E36D877fD9635cF8FcBF3b1377";
const EXPECTED_CHAIN_ID = 11155111n;

const ABI = [
  "function owner() view returns (address)",
  "function relayer() view returns (address)",
  "function setRelayer(address newRelayer)"
];

async function main() {
  const { SEPOLIA_RPC_URL, SEPOLIA_PRIVATE_KEY } = process.env;

  if (!SEPOLIA_RPC_URL || !SEPOLIA_PRIVATE_KEY) {
    throw new Error("Missing Sepolia RPC URL or deployment private key.");
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const network = await provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error("Connected network is not Sepolia.");
  }

  const wallet = new ethers.Wallet(SEPOLIA_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  const owner = await contract.owner();
  const currentRelayer = await contract.relayer();

  console.log("Connected to Sepolia.");
  console.log("Deployment wallet:", wallet.address);
  console.log("Contract owner:", owner);
  console.log("Current relayer:", currentRelayer);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("Deployment wallet is not the contract owner.");
  }

  if (currentRelayer.toLowerCase() === BACKEND_ADDRESS.toLowerCase()) {
    console.log("Backend wallet is already the authorized relayer.");
    return;
  }

  console.log("Setting backend wallet as relayer...");
  const tx = await contract.setRelayer(BACKEND_ADDRESS);

  console.log("Transaction submitted:", tx.hash);
  await tx.wait();

  const updatedRelayer = await contract.relayer();

  if (updatedRelayer.toLowerCase() !== BACKEND_ADDRESS.toLowerCase()) {
    throw new Error("Relayer verification failed.");
  }

  console.log("Success! Backend wallet is now the authorized relayer.");
  console.log("Verified relayer:", updatedRelayer);
}

main().catch((error) => {
  console.error("Relayer setup failed:", error.shortMessage || error.message);
  process.exitCode = 1;
});
