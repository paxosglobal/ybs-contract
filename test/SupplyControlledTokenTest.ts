import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ZeroAddress, MaxUint256 } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { NAME, SYMBOL, DECIMALS, CONTRACT_NAME } from "./helpers/constants";

describe("YBS Supply Controlled Token", function () {
  async function deployYBSFixture() {
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

    return { contract, admin, addr1, addr2 };
  }

  describe("After deployment", function () {
    it("total supply should be zero", async function () {
      const { contract } = await loadFixture(deployYBSFixture);

      expect(await contract.totalSupply()).to.be.equal(0);
    });

    it("balances should be zero", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(await contract.balanceOf(admin.address)).to.be.equal(0);
    });
  });

  describe("increaseSupply", function () {
    const amount = 100;

    it("adds the requested amount", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(await contract.increaseSupply(amount)).not.to.be.reverted;

      expect(await contract.balanceOf(admin.address)).to.be.equal(amount);
      expect(await contract.totalSupply()).to.be.equal(amount);
    });

    it("emits a SupplyIncreased and a Transfer event", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      await expect(await contract.increaseSupply(amount))
        .to.emit(contract, "SupplyIncreased")
        .withArgs(admin.address, amount)
        .to.emit(contract, "Transfer")
        .withArgs(ZeroAddress, admin.address, amount);
    });

    it("reverts when mint amount multiplied by BASE results in overflow", async function () {
      const { contract } = await loadFixture(deployYBSFixture);

      await expect(contract.increaseSupply(MaxUint256)).to.be.revertedWithPanic(
        0x11
      );
    });

    it("mint amount resulting in positive overflow of the totalSupply", async function () {
      const { contract } = await loadFixture(deployYBSFixture);

      const largeAmount = MaxUint256 / BigInt(1e18); // divide by multiplier base
      await contract.increaseSupply(largeAmount);
      await expect(contract.increaseSupply(1)).to.be.revertedWithPanic(0x11);
    });
  });

  describe("decreaseSupply", function () {
    const initialAmount = 500;
    const decreaseAmount = 100;
    const finalAmount = initialAmount - decreaseAmount;

    it("reverts when the supply controller has insufficient tokens", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      await expect(contract.decreaseSupply(decreaseAmount))
        .to.be.revertedWithCustomError(contract, "InsufficientSupply")
        .withArgs(admin.address, 0, decreaseAmount);
    });

    it("removes the requested amount", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);
      await contract.increaseSupply(initialAmount);

      await expect(contract.decreaseSupply(decreaseAmount)).not.to.be.reverted;

      expect(await contract.totalSupply()).to.be.equal(finalAmount);
      expect(await contract.balanceOf(admin.address)).to.be.equal(finalAmount);
    });

    it("emits a SupplyDecreased and a Transfer event", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);
      await contract.increaseSupply(initialAmount);

      await expect(await contract.decreaseSupply(decreaseAmount))
        .to.emit(contract, "SupplyDecreased")
        .withArgs(admin.address, decreaseAmount)
        .to.emit(contract, "Transfer")
        .withArgs(admin.address, ZeroAddress, decreaseAmount);
    });
  });
});
