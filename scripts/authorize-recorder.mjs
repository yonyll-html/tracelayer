import { Contract, JsonRpcProvider, Wallet, getAddress } from "ethers";

const recorderAddress = process.argv[2];

if (!recorderAddress) {
  console.error("Usage: node --env-file=.env scripts/authorize-recorder.mjs <RECORDER_ADDRESS>");
  process.exit(1);
}

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const ownerKey = process.env.SEPOLIA_PRIVATE_KEY;

if (!rpcUrl || !ownerKey) {
  console.error("Missing SEPOLIA_RPC_URL or SEPOLIA_PRIVATE_KEY in .env.");
  process.exit(1);
}

const contractAddress = "0x635Ccee6B979d02dF1f38E03831254BDC5D5A72d";
const abi = [
  "function owner() view returns (address)",
  "function authorizedRecorders(address) view returns (bool)",
  "function setRecorderAuthorization(address recorder, bool authorized)"
];

const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();

if (network.chainId !== 11155111n) {
  throw new Error("Wrong network. Expected Sepolia.");
}

const ownerWallet = new Wallet(ownerKey, provider);
const contract = new Contract(contractAddress, abi, ownerWallet);
const recorder = getAddress(recorderAddress);
const owner = await contract.owner();

if (owner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
  throw new Error("The wallet from SEPOLIA_PRIVATE_KEY is not the contract owner.");
}

if (await contract.authorizedRecorders(recorder)) {
  console.log("This recorder is already authorized:", recorder);
  process.exit(0);
}

console.log("Contract owner:", owner);
console.log("Recorder to authorize:", recorder);

const tx = await contract.setRecorderAuthorization(recorder, true);
console.log("Authorization transaction:", tx.hash);

const receipt = await tx.wait();
console.log("Confirmed in block:", receipt.blockNumber);
console.log("Backend wallet authorized successfully.");
