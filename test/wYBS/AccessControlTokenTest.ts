import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ZeroAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { roles } from "../helpers/constants";
import { deployWrappedYBSFixture } from "../helpers/fixtures";

describe("wYBS Access Controlled Token", function () {
  describe("pause role", function () {
    it("pauses when caller has pause role", async () => {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

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
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).pause()
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.PAUSE_ROLE
        }`
      );
    });

    it("unpauses when caller has pause role", async () => {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

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
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);
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
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

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
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).blockAccounts([addr2.address])
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("unblocks with asset protection role", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

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
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).unblockAccounts([addr2.address])
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("can wipe tokens from blocked account with asset protection role", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await contract.transfer(addr1, 10);
      await contract.blockAccounts([addr1.address]);

      await expect(
        contract.seizeAssets(addr1.address, admin.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });

    it("does not wipe tokens from blocked account without asset protection role", async () => {
      const { contract, admin, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await contract.transfer(addr1, 10);
      await contract.blockAccounts([addr1.address]);

      await expect(
        (contract.connect(addr2) as Contract).seizeAssets(addr1.address, admin.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${
          roles.ASSET_PROTECTION_ROLE
        }`
      );
    });    
  });

  describe("default admin role", function () {
    it("can upgrade with admin role", async () => {
      const { contract } = await loadFixture(deployWrappedYBSFixture);
      const newContract = await ethers.deployContract("YBS");

      await expect(contract.upgradeTo(newContract)).to.not.be.reverted;
    });

    it("cannot upgrade without admin role", async () => {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

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
