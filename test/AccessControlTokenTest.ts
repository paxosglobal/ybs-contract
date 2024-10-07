import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ZeroAddress, parseUnits, MaxUint256 } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { roles } from "./helpers/constants";
import { deployYBSFixture } from "./helpers/fixtures";

describe("YBS Access Controlled Token", function () {
  describe("supply controller role", function () {
    it("only supply controller role can increase supply", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.SUPPLY_CONTROLLER_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).increaseSupply(1)
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.SUPPLY_CONTROLLER_ROLE
        }`
      );
    });

    it("revert when increaseSupply called by unauthorized address", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).increaseSupply(1)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.SUPPLY_CONTROLLER_ROLE
        }`
      );
    });

    it("only supply controller role can decrease supply", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.SUPPLY_CONTROLLER_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).decreaseSupply(1)
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.SUPPLY_CONTROLLER_ROLE
        }`
      );
    });

    it("revert when decreaseSupply called by unauthorized address", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).decreaseSupply(1)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.SUPPLY_CONTROLLER_ROLE
        }`
      );
    });

    it("prevents old supply controller from increasing supply", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      await contract.revokeRole(roles.SUPPLY_CONTROLLER_ROLE, admin.address);

      await expect(contract.increaseSupply(1)).to.be.revertedWith(
        `AccessControl: account ${admin.address.toLowerCase()} is missing role ${
          roles.SUPPLY_CONTROLLER_ROLE
        }`
      );
    });

    it("prevents old supply controller from decreasing supply", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      await contract.revokeRole(roles.SUPPLY_CONTROLLER_ROLE, admin.address);

      await expect(contract.decreaseSupply(1)).to.be.revertedWith(
        `AccessControl: account ${admin.address.toLowerCase()} is missing role ${
          roles.SUPPLY_CONTROLLER_ROLE
        }`
      );
    });
  });

  describe("pause role", function () {
    it("pauses when caller has pause role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.PAUSE_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).pause()
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.PAUSE_ROLE
        }`
      );
    });

    it("reverts pause when caller does not have pause role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.PAUSE_ROLE
        }`
      );
    });

    it("unpauses when caller has pause role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.PAUSE_ROLE, addr1.address);
      await contract.pause();

      await expect(
        (contract.connect(addr1) as Contract).unpause()
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.PAUSE_ROLE
        }`
      );
    });

    it("reverts unpause when caller does not have pause role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      await contract.pause();

      await expect(
        (contract.connect(addr1) as Contract).unpause()
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.PAUSE_ROLE
        }`
      );
    });
  });

  describe("asset protection role", function () {
    it("blocks with role", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.ASSET_PROTECTION_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).blockAccounts([addr2.address])
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("does not block without asset protection role", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).blockAccounts([addr2.address])
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("unblocks with asset protection role", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.ASSET_PROTECTION_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).unblockAccounts([addr2.address])
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("does not unblock without asset protection role", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).unblockAccounts([addr2.address])
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("can wipe tokens from blocked account with asset protection role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.transfer(addr1, 10);
      await contract.blockAccounts([addr1.address]);

      await expect(
        contract.wipeBlockedAddress(addr1.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("does not wipe tokens from blocked account without asset protection role", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

      await contract.transfer(addr1, 10);
      await contract.blockAccounts([addr1.address]);

      await expect(
        (contract.connect(addr2) as Contract).wipeBlockedAddress(addr1.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    describe("block/unblock accounts from receiving", function () {
      it("successful block", async () => {
        const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

        await contract.grantRole(roles.ASSET_PROTECTION_ROLE, addr1.address);

        await expect((contract.connect(addr1) as Contract).blockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;

        await expect(await contract.isAddrBlockedForReceiving(addr2.address)).to.be.true;
      });

      it("block account multiple times to check for idempotency", async () => {
        const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

        await contract.grantRole(roles.ASSET_PROTECTION_ROLE, addr1.address);

        await expect((contract.connect(addr1) as Contract).blockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;
        await expect((contract.connect(addr1) as Contract).blockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;

        await expect(await contract.isAddrBlockedForReceiving(addr2.address)).to.be.true;
      });

      it("successful unblock", async () => {
        const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

        await contract.grantRole(roles.ASSET_PROTECTION_ROLE, addr1.address);

        await expect((contract.connect(addr1) as Contract).blockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;

        await expect((contract.connect(addr1) as Contract).unblockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;

        await expect(await contract.isAddrBlockedForReceiving(addr2.address)).to.be.false;
      });

      it("unblock account multiple times to check for idempotency", async () => {
        const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

        await contract.grantRole(roles.ASSET_PROTECTION_ROLE, addr1.address);

        await expect((contract.connect(addr1) as Contract).blockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;

        await expect((contract.connect(addr1) as Contract).unblockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;
        await expect((contract.connect(addr1) as Contract).unblockAccountsFromReceiving([addr2.address]))
          .to.not.be.reverted;

        await expect(await contract.isAddrBlockedForReceiving(addr2.address)).to.be.false;
      });

      it("does not block without correct role", async () => {
        const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

        await expect((contract.connect(addr1) as Contract).blockAccountsFromReceiving([addr2.address]))
        .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${roles.ASSET_PROTECTION_ROLE}`);
      });

      it("does not unblock without correct role", async () => {
        const { contract, addr1, addr2 } = await loadFixture(deployYBSFixture);

        await expect((contract.connect(addr1) as Contract).unblockAccountsFromReceiving([addr2.address]))
        .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${roles.ASSET_PROTECTION_ROLE}`);
      });
    });    
  });

  describe("rebase admin role", function () {
    it("can set the rebase period with rebase-admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      await contract.grantRole(roles.REBASE_ADMIN_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).setRebasePeriod(1)).to.not.be.reverted;
    });

    it("cannot set the rebase period without rebase-admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).setRebasePeriod(1)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.REBASE_ADMIN_ROLE
        }`
      );
    });

    it("can set the max rebase rate with rebase-admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      await contract.grantRole(roles.REBASE_ADMIN_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).setMaxRebaseRate(1)).to.not.be.reverted;
    });

    it("cannot set the max rebase rate without rebase-[admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).setMaxRebaseRate(1)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.REBASE_ADMIN_ROLE
        }`
      );
    });

    it("can set the rebase multiplier with rebase-admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      const nextMult = parseUnits("1.0001");
      await contract.grantRole(roles.REBASE_ADMIN_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).setNextMultiplier(nextMult, MaxUint256, parseUnits("99"))).to.not.be.reverted;
    });

    it("cannot set the rebase multiplier without rebase-admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      const nextMult = parseUnits("1.0001");

      await expect(
        (contract.connect(addr1) as Contract).setNextMultiplier(nextMult, MaxUint256, 0)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.REBASE_ADMIN_ROLE
        }`
      );
    });

  });

  describe("rebase role", function () {
    it("increases the rebase multiplier with rebase role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.grantRole(roles.REBASE_ROLE, addr1.address);

      await expect(
        (contract.connect(addr1) as Contract).increaseRebaseMultiplier(1, 0)
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.REBASE_ROLE
        }`
      );
    });

    it("does not add a rebase multiplier without rebase role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).increaseRebaseMultiplier(1, 0)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.REBASE_ROLE
        }`
      );
    });
  });

  describe("default admin role", function () {
    it("can upgrade with admin role", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const newContract = await ethers.deployContract("YBS");

      await expect(contract.upgradeTo(newContract)).to.not.be.reverted;
    });

    it("cannot upgrade without admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).upgradeTo(ZeroAddress)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.DEFAULT_ADMIN_ROLE
        }`
      );
    });
  });
});
