import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits, ZeroAddress } from "ethers";
import { Contract } from "ethers";

import { NAME, SYMBOL, DECIMALS, CONTRACT_NAME, roles } from "./helpers/constants";

describe("YBSDeprecated", function () {
  async function deployYBSDeprecatedFixture() {
    const [admin, addr1, addr2] = await ethers.getSigners();

    // Note: Contract inherits from upgradeable contracts but has no initializer
    // Deploying directly since there's no initialize function
    const YBSDeprecated = await ethers.getContractFactory("YBSDeprecated");
    const contract = await YBSDeprecated.deploy();

    return { contract, admin, addr1, addr2 };
  }

  describe("ERC20 Metadata", function () {
    it("should have hardcoded name 'Lift Dollar - Deprecated'", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);
      const name = await contract.name();
      expect(name).to.equal("Lift Dollar - Deprecated");
    });

    it("should have hardcoded symbol 'USDL'", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);
      const symbol = await contract.symbol();
      expect(symbol).to.equal("USDL");
    });

    it("should have hardcoded decimals of 18", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);
      const decimals = await contract.decimals();
      expect(decimals).to.equal(18);
    });
  });

  describe("ERC20 Supply and Balances", function () {
    it("totalSupply should always return zero", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);

      expect(await contract.totalSupply()).to.equal(0);
    });

    it("balanceOf should always return zero for any address", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployYBSDeprecatedFixture);

      expect(await contract.balanceOf(admin.address)).to.equal(0);
      expect(await contract.balanceOf(addr1.address)).to.equal(0);
      expect(await contract.balanceOf(ethers.ZeroAddress)).to.equal(0);
    });
  });

  describe("ERC20 Allowances", function () {
    it("allowance should always return zero", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployYBSDeprecatedFixture);

      expect(await contract.allowance(admin.address, addr1.address)).to.equal(0);
      expect(await contract.allowance(addr1.address, admin.address)).to.equal(0);
    });
  });

  describe("ERC20 Transfers - Deprecated", function () {
    it("transfer should revert with ContractDeprecated error", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSDeprecatedFixture);
      const amount = parseUnits("100", 18);

      await expect(
        contract.transfer(addr1.address, amount)
      ).to.be.revertedWithCustomError(contract, "ContractDeprecated");
    });

    it("transferFrom should revert with ContractDeprecated error", async function () {
      const { contract, admin, addr1, addr2 } = await loadFixture(deployYBSDeprecatedFixture);
      const amount = parseUnits("100", 18);

      await expect(
        contract.transferFrom(admin.address, addr1.address, amount)
      ).to.be.revertedWithCustomError(contract, "ContractDeprecated");

      await expect(
        contract.connect(addr2).transferFrom(admin.address, addr1.address, amount)
      ).to.be.revertedWithCustomError(contract, "ContractDeprecated");
    });
  });

  describe("ERC20 Approvals - Deprecated", function () {
    it("approve should revert with ContractDeprecated error", async function () {
      const { contract, addr1 } = await loadFixture(deployYBSDeprecatedFixture);
      const amount = parseUnits("100", 18);

      await expect(
        contract.approve(addr1.address, amount)
      ).to.be.revertedWithCustomError(contract, "ContractDeprecated");
    });

    it("approve should revert even with zero address spender", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);
      const amount = parseUnits("100", 18);

      await expect(
        contract.approve(ethers.ZeroAddress, amount)
      ).to.be.revertedWithCustomError(contract, "ContractDeprecated");
    });
  });

  describe("Access Control", function () {
    it("should have AccessControlDefaultAdminRulesUpgradeable interface", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);

      // Verify access control functions exist by checking if they're callable
      const contractAsAny = contract as any;
      expect(contractAsAny.hasRole).to.be.a("function");
      expect(contractAsAny.DEFAULT_ADMIN_ROLE).to.be.a("function");
    });

    it("should have UUPSUpgradeable interface", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);

      // Verify upgrade functions exist by checking if they're callable
      const contractAsAny = contract as any;
      expect(contractAsAny.upgradeTo).to.be.a("function");
      expect(contractAsAny.upgradeToAndCall).to.be.a("function");
    });
  });

  describe("Contract State", function () {
    it("should maintain ERC20 interface compliance", async function () {
      const { contract } = await loadFixture(deployYBSDeprecatedFixture);

      // Verify all required ERC20 functions exist
      expect(contract.totalSupply).to.be.a("function");
      expect(contract.balanceOf).to.be.a("function");
      expect(contract.transfer).to.be.a("function");
      expect(contract.transferFrom).to.be.a("function");
      expect(contract.approve).to.be.a("function");
      expect(contract.allowance).to.be.a("function");
    });
  });

  describe("Upgrade from YBSV1_1", function () {
    it("should upgrade from YBSV1_1 to YBSDeprecated", async function () {
      this.timeout(60000);

      const [
        admin,
        supplyController,
        pauser,
        assetProtector,
        rebaserAdmin,
        rebaser,
        addr1,
        addr2,
      ] = await ethers.getSigners();

      // Deploy YBSV1_1 as a proxy
      const initializerArgs = [
        NAME,
        SYMBOL,
        DECIMALS,
        admin.address,
        supplyController.address,
        pauser.address,
        assetProtector.address,
        rebaserAdmin.address,
        rebaser.address,
      ];

      const YBSV1_1 = await ethers.getContractFactory(CONTRACT_NAME);
      const proxy = await upgrades.deployProxy(YBSV1_1, initializerArgs, {
        initializer: "initialize",
      });

      const proxyAddress = await proxy.getAddress();

      // Set some state before upgrade
      const amount = parseUnits("100", 18);
      await (proxy.connect(supplyController) as Contract).increaseSupply(amount);
      await (proxy.connect(supplyController) as Contract).transfer(addr1.address, parseUnits("50", 18));

      // Verify initial state
      expect(await proxy.name()).to.equal(NAME);
      expect(await proxy.symbol()).to.equal(SYMBOL);
      expect(await proxy.totalSupply()).to.equal(amount);
      expect(await proxy.balanceOf(addr1.address)).to.equal(parseUnits("50", 18));
      expect(await proxy.hasRole(roles.DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;

      // Verify transfers work before upgrade
      await expect(
        (proxy.connect(addr1) as Contract).transfer(addr2.address, parseUnits("10", 18))
      ).to.not.be.reverted;

      // Deploy YBSDeprecated implementation
      const YBSDeprecated = await ethers.getContractFactory("YBSDeprecated");
      const deprecatedImpl = await YBSDeprecated.deploy();

      // Upgrade the proxy to YBSDeprecated
      await expect(proxy.upgradeTo(await deprecatedImpl.getAddress())).to.not.be.reverted;

      // Verify the proxy address hasn't changed
      expect(await proxy.getAddress()).to.equal(proxyAddress);

      // Get a new contract instance with YBSDeprecated ABI to recognize custom errors
      const deprecatedProxy = YBSDeprecated.attach(proxyAddress) as Contract;

      // Verify metadata changed to deprecated values
      expect(await deprecatedProxy.name()).to.equal("Lift Dollar - Deprecated");
      expect(await deprecatedProxy.symbol()).to.equal("USDL");
      expect(await deprecatedProxy.decimals()).to.equal(18);

      // Verify deprecated behavior - transfers should revert
      await expect(
        deprecatedProxy.connect(addr1).transfer(addr2.address, parseUnits("10", 18))
      ).to.be.revertedWithCustomError(deprecatedProxy, "ContractDeprecated");

      await expect(
        deprecatedProxy.connect(addr1).approve(addr2.address, parseUnits("10", 18))
      ).to.be.revertedWithCustomError(deprecatedProxy, "ContractDeprecated");

      // Verify totalSupply and balanceOf now return 0 (deprecated behavior)
      expect(await deprecatedProxy.totalSupply()).to.equal(0);
      expect(await deprecatedProxy.balanceOf(addr1.address)).to.equal(0);
      expect(await deprecatedProxy.balanceOf(admin.address)).to.equal(0);

      // Verify access control is preserved
      expect(await deprecatedProxy.hasRole(roles.DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;

      // Verify a random signer (non-admin) cannot upgrade the contract
      // Verify addr1 does not have admin role
      expect(await deprecatedProxy.hasRole(roles.DEFAULT_ADMIN_ROLE, addr1.address)).to.be.false;
      
      // Deploy a new implementation to attempt upgrade to
      const anotherImpl = await YBSDeprecated.deploy();
      const anotherImplAddress = await anotherImpl.getAddress();
      
      // Attempt upgrade should revert with access control error
      await expect(
        (deprecatedProxy.connect(addr1) as Contract).upgradeTo(anotherImplAddress)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${roles.DEFAULT_ADMIN_ROLE}`
      );
    });
  });
});

