import { ethers } from "hardhat";
import { fail } from "assert";

export async function getBlockTimestamp() {
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);

  if (block) {
    return block.timestamp;
  } else {
    fail("Error: Unable to retrieve block information");
  }
}