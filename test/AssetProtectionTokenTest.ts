import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, ZeroAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { NAME, SYMBOL, DECIMALS, CONTRACT_NAME, roles } from "./helpers/constants";

describe("YBS Asset Protection", function () {
  const amount = 10;

  async function deployYBSFixture() {
    const [admin, addr1, addr2, addr3, blockedAddr] = await ethers.getSigners();

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

    await (contract.connect(blockedAddr) as Contract).approve(admin.address, amount); 
    await (contract.connect(addr1) as Contract).approve(admin.address, amount); 

    await contract.blockAccounts([blockedAddr.address]);

    return { contract, admin, addr1, addr2, addr3, blockedAddr };
  }

  describe("Blocklist test suite", () => {

    it("blocks single account", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(contract.blockAccounts([addr1.address]))
        .to.emit(contract, "AccountBlocked")
        .withArgs(addr1.address);

      expect(await contract.isAddrBlocked(addr1.address)).to.be.true;
    });

    it("blocks multiples accounts", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await contract.blockAccounts([addr1.address, addr2.address]);

      const result = await Promise.all([
        contract.isAddrBlocked(addr1.address),
        contract.isAddrBlocked(addr2.address),
      ]);

      expect(result.every(Boolean)).to.be.true;
    });

    it("unblocks single account", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.blockAccounts([addr1.address]);
      await expect(contract.unblockAccounts([addr1.address]))
        .to.emit(contract, "AccountUnblocked")
        .withArgs(addr1.address);

      expect(await contract.isAddrBlocked(addr1.address)).to.be.false;
    });

    it("unblocks multiples accounts", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await contract.blockAccounts([addr1.address, addr2.address]);
      await contract.unblockAccounts([addr1.address, addr2.address]);

      const result = await Promise.all([
        contract.isAddrBlocked(addr1.address),
        contract.isAddrBlocked(addr2.address),
      ]);

      expect(result.every((value) => value === false)).to.be.true;
    });

    it("reverts when transfer is from blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).transfer(
          addr1.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when transfer is to blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        (contract.connect(addr1) as Contract).transfer(
          blockedAddr.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("reverts when transferFrom is by blocked address", async function () {
      const { contract, addr1, addr2, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).transferFrom(
          addr1.address,
          addr2.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts when transferFrom is from blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        contract.transferFrom(blockedAddr.address, addr1.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when transferFrom is to blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        contract.transferFrom(addr1.address, blockedAddr.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("reverts when approve is from the blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).approve(
          addr1.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when approve spender is the blocked address", async function () {
      const { contract, blockedAddr } = await loadFixture(deployYBSFixture);

      await expect(
        contract.approve(blockedAddr, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts when increase approval is from the blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).increaseApproval(
          addr1.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when increase approve spender is the blocked address", async function () {
      const { contract, blockedAddr } = await loadFixture(deployYBSFixture);

      await expect(
        contract.increaseApproval(blockedAddr.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts when decrease approval is from the blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).decreaseApproval(
          addr1.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when decrease approval spender is the blocked address", async function () {
      const { contract, blockedAddr } = await loadFixture(deployYBSFixture);

      await expect(
        contract.decreaseApproval(blockedAddr.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("unblocked address can transfer again", async function () {
      const { contract, blockedAddr, addr1 } = await loadFixture(
        deployYBSFixture
      );
      await contract.unblockAccounts([blockedAddr.address]);

      await expect(contract.transfer(blockedAddr, amount)).to.not.reverted;
      expect(await contract.balanceOf(blockedAddr)).to.be.equal(amount);

      await expect(
        (contract.connect(blockedAddr) as Contract).transfer(addr1, amount)
      ).to.not.reverted;
      expect(await contract.balanceOf(blockedAddr)).to.be.equal(0);
    });

    it("reverts when increaseSupply is from a blocked address", async function () {
      const { contract, blockedAddr } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.SUPPLY_CONTROLLER_ROLE, blockedAddr.address);

      await expect(
        (contract.connect(blockedAddr) as Contract).increaseSupply(amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });
  });

  describe("wipeBlockedAddress", function () {
    const amount = 10;

    it("reverts when address is not blocked", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        contract.wipeBlockedAddress(addr1.address)
      ).to.be.revertedWithCustomError(contract, "AccountNotBlocked");
    });

    it("wipes a frozen address balance", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.transfer(addr1, amount);
      await contract.blockAccounts([addr1.address]);

      await expect(contract.wipeBlockedAddress(addr1.address))
        .to.emit(contract, "BlockedAccountWiped")
        .withArgs(addr1.address)
        .to.emit(contract, "SupplyDecreased")
        .withArgs(addr1.address, amount)
        .to.emit(contract, "Transfer")
        .withArgs(addr1.address, ZeroAddress, amount);

      expect(await contract.isAddrBlocked(addr1.address)).to.be.true;
      expect(await contract.balanceOf(addr1.address)).to.be.equal(0);
    });
  });

  describe("BlockReceivingAccounts", function () {
    it("blocks an account", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      await expect(contract.blockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1);

      expect(await contract.isAddrBlockedForReceiving(addr1)).to.be.true;
    });

    it("blocks multiple accounts", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);
      await expect(contract.blockAccountsFromReceiving([addr1, addr2]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1).to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr2);

      expect(await contract.isAddrBlockedForReceiving(addr1)).to.be.true;
      expect(await contract.isAddrBlockedForReceiving(addr2)).to.be.true;
    });

    it("unblocks an account", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      await expect(contract.blockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1);

      // Validate if its blocked.
      expect(await contract.isAddrBlockedForReceiving(addr1)).to.be.true;

      await expect(contract.unblockAccountsFromReceiving([addr1]))
      .to.emit(contract, "AccountUnblockedFromReceivingToken")
        .withArgs(addr1);

      expect(await contract.isAddrBlockedForReceiving(addr1)).to.be.false;
    });

    it("unblocks multiple accounts", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);
      await expect(contract.blockAccountsFromReceiving([addr1, addr2]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1).to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr2);

      await expect(contract.unblockAccountsFromReceiving([addr1, addr2]))
        .to.emit(contract, "AccountUnblockedFromReceivingToken")
        .withArgs(addr1).to.emit(contract, "AccountUnblockedFromReceivingToken")
        .withArgs(addr2);

      expect(await contract.isAddrBlockedForReceiving(addr1)).to.be.false;
      expect(await contract.isAddrBlockedForReceiving(addr2)).to.be.false;
    });

    it ("blocked accounts should not be able to receive via transfer", async () => {
      const { contract, addr1, addr2} = await loadFixture(deployYBSFixture);

      await expect(contract.transfer(addr1, amount)).to.not.reverted;

      await expect(contract.blockAccountsFromReceiving([addr2]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr2);

      await expect((contract.connect(addr1) as Contract).transfer(addr2, amount))
        .to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it ("blocked accounts should not be able to receive via delegate trasfer", async () => {
      const { contract, addr1, addr2, addr3 } = await loadFixture(deployYBSFixture);

      await expect(contract.transfer(addr3, amount)).to.not.reverted;

      await expect(contract.blockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1);

      // addr1(blocked) cannot receive from addr3(spender) via addr2(delegate)
      await (contract.connect(addr3) as Contract).approve(addr2, amount); 
      await expect((contract.connect(addr2) as Contract).transferFrom(addr3, addr1, amount))
        .to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");

    });

    it ("blocked account can still send to unblocked account", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture)

      await expect(contract.transfer(addr1, amount)).to.not.reverted;

      await expect(contract.blockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1);

      // addr1(blocked) can still send.
      await expect((contract.connect(addr1) as Contract).transfer(addr2, amount))
        .to.not.reverted;
      expect(await contract.balanceOf(addr1)).to.be.equal(0);
      expect(await contract.balanceOf(addr2)).to.be.equal(amount);

    });

    it ("unblocked accounts should be able to receive via transfer", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await expect(contract.transfer(addr2, amount)).to.not.reverted;

      await expect(contract.blockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1);
      await expect(contract.unblockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountUnblockedFromReceivingToken")
        .withArgs(addr1);

      // validate addr1 can receive
      await expect((contract.connect(addr2) as Contract).transfer(addr1, amount)).to.not.reverted;
      expect(await contract.balanceOf(addr1)).to.be.equal(amount);
    });


    it ("unblocked accounts should be able to receive via transferFrom", async () => {
      const { contract, addr1, addr2, addr3 } = await loadFixture(deployYBSFixture);

      await expect(contract.transfer(addr3, amount)).to.not.reverted;

      await expect(contract.blockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountBlockedFromReceivingToken")
        .withArgs(addr1);
      await expect(contract.unblockAccountsFromReceiving([addr1]))
        .to.emit(contract, "AccountUnblockedFromReceivingToken")
        .withArgs(addr1);

      await (contract.connect(addr3) as Contract).approve(addr2, amount); 

      // addr1 can still receive
      await expect((contract.connect(addr2) as Contract).transferFrom(addr3, addr1, amount)).to.not.reverted;
      expect(await contract.balanceOf(addr1)).to.be.equal(amount);
    });

  });

});
