 import { NAME, SYMBOL, DECIMALS, CONTRACT_NAME } from "./constants";
 import { ethers, upgrades } from "hardhat";

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
