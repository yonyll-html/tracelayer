import { network } from "hardhat";

const { ethers } = await network.connect();

console.log("Connected network:", await ethers.provider.getNetwork());
console.log("Latest block:", await ethers.provider.getBlockNumber());
