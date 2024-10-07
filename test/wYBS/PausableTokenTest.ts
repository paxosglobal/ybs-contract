import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Contract } from "ethers";
import { deployWrappedYBSFixture } from "../helpers/fixtures";

describe("wYBS Pausable Token", function () {

  describe("pause/unpause", function () {
    const amount = 10;

    it("can transfer in non-pause", async function () {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      expect(await contract.paused()).to.be.false;

      await contract.transfer(addr1.address, amount);
      expect(await contract.balanceOf(addr1.address)).to.be.equal(amount);
    });

    it("cannot transfer in pause", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await expect(contract.pause()).to.emit(contract, "Paused");
      expect(await contract.paused()).to.be.true;

      await expect(contract.transfer(addr1.address, amount)).to.be.revertedWith(
        "Pausable: paused"
      );
      expect(await contract.balanceOf(admin.address)).to.be.equal(100);
    });

    it("cannot approve in pause", async function () {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await contract.pause();
      await expect(contract.approve(addr1.address, amount)).to.be.revertedWith(
        "Pausable: paused"
      );
    });

    it("cannot increaseAllowance in pause", async function () {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await contract.pause();
      await expect(
        contract.increaseAllowance(addr1.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("cannot decreaseAllowance in pause", async function () {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);
      await contract.increaseAllowance(addr1.address, amount)

      await contract.pause();
      await expect(
        contract.decreaseAllowance(addr1.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("cannot transferFrom in pause", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await contract.approve(addr1.address, amount);
      await contract.pause();

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(admin.address, addr1.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("cannot transferFromBatch in pause", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await contract.approve(addr1.address, amount);
      await contract.pause();

      await expect(
        (contract.connect(addr1) as Contract).transferFromBatch([admin.address], [addr1.address], [amount])
      ).to.be.revertedWith("Pausable: paused");
    });

    it("should resume allowing normal process after pause is over", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);
      await contract.pause();

      await expect(contract.unpause()).to.emit(contract, "Unpaused");
      expect(await contract.paused()).to.be.false;

      await contract.transfer(addr1.address, amount);
      expect(await contract.balanceOf(addr1.address)).to.be.equal(amount);

      await expect(contract.approve(addr1.address, amount)).to.not.be.reverted;
      await expect(contract.decreaseAllowance(addr1.address, amount)).to.not.be.reverted;

      await expect((contract.connect(addr1) as Contract).increaseAllowance(admin.address, amount)).to.not.be.reverted;
      await expect(contract.transferFrom(addr1.address, admin.address, amount)).to.not.be.reverted;
    });

    it("cannot unpause when unpaused or pause when paused", async function () {
      const { contract } = await loadFixture(deployWrappedYBSFixture);
      await expect(contract.unpause()).to.be.revertedWith(
        "Pausable: not paused"
      );

      await contract.pause();
      await expect(contract.pause()).to.be.revertedWith("Pausable: paused");
    });

    it("cannot deposit in pause", async function () {
      const { contract, ybsContract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      ybsContract.increaseSupply(amount);
      await ybsContract.approve(await contract.getAddress(), amount);

      await contract.pause();
      await expect(contract.deposit(amount, addr1.address)).to.be.revertedWith("Pausable: paused");
    });

    it("cannot mint in pause", async function () {
      const { contract, ybsContract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      ybsContract.increaseSupply(amount);
      await ybsContract.approve(await contract.getAddress(), amount);

      await contract.pause();
      await expect(contract.mint(amount, addr1.address)).to.be.revertedWith("Pausable: paused");
    });

    it("cannot withdraw in pause", async function () {
      const { contract, admin } = await loadFixture(deployWrappedYBSFixture);

      await contract.pause();
      await expect(contract.withdraw(amount, admin.address, admin.address)).to.be.revertedWith("Pausable: paused");
    });

    it("cannot redeem in pause", async function () {
      const { contract, admin } = await loadFixture(deployWrappedYBSFixture);

      await contract.pause();
      await expect(contract.redeem(amount, admin.address, admin.address)).to.be.revertedWith("Pausable: paused");
    });
  });
});
