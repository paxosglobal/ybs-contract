import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { ZeroAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits } from "ethers";

import { deployWrappedYBSFixture } from "../helpers/fixtures";
import { W_NAME, W_SYMBOL, DECIMALS, W_CONTRACT_NAME, roles } from "../helpers/constants";

describe("wYBS ERC20", function () {
  const base = parseUnits("1");

  describe("ERC20 Basics", function () {
    it("deployed with name", async function () {
      const { contract } = await loadFixture(deployWrappedYBSFixture);

      expect(await contract.name()).to.equal(W_NAME);
    });

    it("deployed with symbol", async function () {
      const { contract } = await loadFixture(deployWrappedYBSFixture);

      expect(await contract.symbol()).to.equal(W_SYMBOL);
    });

    it("deployed with decimals", async function () {
      const { contract } = await loadFixture(deployWrappedYBSFixture);

      expect(await contract.decimals()).to.be.equal(DECIMALS);
    });

    it("can set default admin role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployWrappedYBSFixture);

      expect(
        await contract.hasRole(
          await contract.DEFAULT_ADMIN_ROLE(),
          admin.address
        )
      ).to.equal(true);
    });

    it("can set pause role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployWrappedYBSFixture);

      expect(await contract.hasRole(roles.PAUSE_ROLE, admin.address)).to.equal(
        true
      );
    });

    it("can set asset protection role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployWrappedYBSFixture);

      expect(
        await contract.hasRole(roles.ASSET_PROTECTION_ROLE, admin.address)
      ).to.equal(true);
    });

    it("cannot initialize YBS as zero address", async function () {
      const [admin] = await ethers.getSigners();
      let initializerArgs = [
        W_NAME,
        W_SYMBOL,
        ZeroAddress,
        admin.address,
        admin.address,
        admin.address,
      ];
    
      const wYBS = await ethers.getContractFactory(W_CONTRACT_NAME);

      await expect(
        upgrades.deployProxy(wYBS, initializerArgs, {
          initializer: "initialize",
        })
      ).to.be.revertedWithCustomError(wYBS, "ZeroAddress");
    });

    it("cannot initialize roles as zero address", async function () {
      const { ybsContract, admin } = await loadFixture(deployWrappedYBSFixture);
      let initializerArgs = [
        W_NAME,
        W_SYMBOL,
        await ybsContract.getAddress(),
        admin.address, // default admin already checked in __AccessControlDefaultAdminRules_init
        admin.address,
        admin.address,
      ];
    
      const wYBS = await ethers.getContractFactory(W_CONTRACT_NAME);
      const startRoleArg = 4;
      const endRoleArg = 5;

      for (let i = startRoleArg; i <= endRoleArg; i++) {
        initializerArgs[i] = ZeroAddress;

        await expect(
          upgrades.deployProxy(wYBS, initializerArgs, {
            initializer: "initialize",
          })
        ).to.be.revertedWithCustomError(wYBS, "ZeroAddress");

        initializerArgs[i] = admin.address;
      }
    });

    it("cannot call initialize again after deployment", async function () {
      const { contract, admin } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        contract.initialize(
        W_NAME,
        W_SYMBOL,
        admin.address,
        admin.address,
        admin.address,
        admin.address,
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("has total supply", async function () {
      const { contract } = await loadFixture(deployWrappedYBSFixture);

      expect(await contract.totalSupply()).to.be.equal(100);
    });

    it("balanceOf", async function () {
      const { contract, admin } = await loadFixture(deployWrappedYBSFixture);

      expect(await contract.balanceOf(admin.address)).to.be.equal(100);
    });
  });

  describe("Transfer", () => {
    it("transfers tokens to another account", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await expect(contract.transfer(addr1.address, 10))
        .to.emit(contract, "Transfer")
        .withArgs(admin.address, addr1.address, 10);

      expect(await contract.balanceOf(admin.address)).to.be.equal(90);
      expect(await contract.balanceOf(addr1.address)).to.be.equal(10);
    });
  });
});
