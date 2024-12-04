import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { deployYBSFixture } from "./helpers/fixtures";

describe("YBS Pausable Token", function () {

  describe("pause/unpause", function () {
    const amount = 10;

    it("can transfer in non-pause", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      expect(await contract.paused()).to.be.false;

      await contract.transfer(addr1.address, amount);
      expect(await contract.balanceOf(addr1.address)).to.be.equal(amount);
    });

    it("cannot transfer in pause", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await expect(contract.pause()).to.emit(contract, "Paused");
      expect(await contract.paused()).to.be.true;

      await expect(contract.transfer(addr1.address, amount)).to.be.revertedWith(
        "Pausable: paused"
      );
      expect(await contract.balanceOf(admin.address)).to.be.equal(100);
    });

    it("cannot approve in pause", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.pause();
      await expect(contract.approve(addr1.address, amount)).to.be.revertedWith(
        "Pausable: paused"
      );
    });

    it("cannot increaseApproval in pause", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.pause();
      await expect(
        contract.increaseApproval(addr1.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("cannot decreaseApproval in pause", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.pause();
      await expect(
        contract.decreaseApproval(addr1.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("cannot transferFrom in pause", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, amount);
      await contract.pause();

      await expect(
        contract.transferFrom(admin.address, addr1.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("cannot transferFromBatch in pause", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, amount);
      await contract.pause();

      await expect(
        contract.transferFromBatch([admin.address], [addr1.address], [amount])
      ).to.be.revertedWith("Pausable: paused");
    });

    it("should resume allowing normal process after pause is over", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      await contract.pause();

      await expect(contract.unpause()).to.emit(contract, "Unpaused");
      expect(await contract.paused()).to.be.false;

      await contract.transfer(addr1.address, amount);
      expect(await contract.balanceOf(addr1.address)).to.be.equal(amount);
    });

    it("cannot unpause when unpaused or pause when paused", async function () {
      const { contract } = await loadFixture(deployYBSFixture);
      await expect(contract.unpause()).to.be.revertedWith(
        "Pausable: not paused"
      );

      await contract.pause();
      await expect(contract.pause()).to.be.revertedWith("Pausable: paused");
    });
  });
});
