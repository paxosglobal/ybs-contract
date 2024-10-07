import { 
  NAME, SYMBOL, DECIMALS, CONTRACT_NAME, 
  W_NAME, W_SYMBOL, W_CONTRACT_NAME 
} from "./constants";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

export async function deployYBSFixture() {
  const [admin, addr1, addr2] = await ethers.getSigners();
  const initializerArgs = [
    NAME,
    SYMBOL,
    DECIMALS,
    admin.address,
    admin.address,
    admin.address,
    admin.address,
    admin.address,
    admin.address,
  ];

  const YBS = await ethers.getContractFactory(CONTRACT_NAME);
  const contract = await upgrades.deployProxy(YBS, initializerArgs, {
    initializer: "initialize",
  });

  await contract.increaseSupply(100);

  return { contract, admin, addr1, addr2 };
}

export async function deployWrappedYBSFixture() {
  let { contract } = await loadFixture(deployYBSFixture);
  const ybsContract = contract;

  const [admin, addr1, addr2] = await ethers.getSigners();
  const initializerArgs = [
    W_NAME,
    W_SYMBOL,
    await ybsContract.getAddress(),
    admin.address,
    admin.address,
    admin.address,
  ];

  const YBS = await ethers.getContractFactory(W_CONTRACT_NAME);
  const wYbsContract = await upgrades.deployProxy(YBS, initializerArgs, {
    initializer: "initialize",
  });

  await ybsContract.approve(await wYbsContract.getAddress(), 100);
  await wYbsContract.mint(100, admin.address);
  contract = wYbsContract

  return { contract, ybsContract, admin, addr1, addr2 };
}