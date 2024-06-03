import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, ZeroAddress, MaxUint256 } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits } from "ethers";

import { deployYBSFixture } from "./helpers/fixtures";
import { NAME, SYMBOL, DECIMALS, CONTRACT_NAME, roles } from "./helpers/constants";

describe("YBS ERC20", function () {
  const base = parseUnits("1");

  describe("ERC20 Basics", function () {
    it("deployed with name", async function () {
      const { contract } = await loadFixture(deployYBSFixture);

      expect(await contract.name()).to.equal(NAME);
    });

    it("deployed with symbol", async function () {
      const { contract } = await loadFixture(deployYBSFixture);

      expect(await contract.symbol()).to.equal(SYMBOL);
    });

    it("deployed with decimals", async function () {
      const { contract } = await loadFixture(deployYBSFixture);

      expect(await contract.decimals()).to.be.equal(DECIMALS);
    });

    it("can set default admin role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(
        await contract.hasRole(
          await contract.DEFAULT_ADMIN_ROLE(),
          admin.address
        )
      ).to.equal(true);
    });

    it("can set supply controller role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(
        await contract.hasRole(roles.SUPPLY_CONTROLLER_ROLE, admin.address)
      ).to.equal(true);
    });

    it("can set pause role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(await contract.hasRole(roles.PAUSE_ROLE, admin.address)).to.equal(
        true
      );
    });

    it("can set asset protection role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(
        await contract.hasRole(roles.ASSET_PROTECTION_ROLE, admin.address)
      ).to.equal(true);
    });

    it("can set rebase admin role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(
        await contract.hasRole(roles.REBASE_ADMIN_ROLE, admin.address)
      ).to.equal(true);
    });

    it("can set rebase role at initialization", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(
        await contract.hasRole(roles.REBASE_ROLE, admin.address)
      ).to.equal(true);
    });

    it("cannot initialize roles as zero address", async function () {
      const [admin] = await ethers.getSigners();
      let initializerArgs = [
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
      const startRoleArg = 4; // skip admin, role is checked by OZ's AccessControlDefaultAdminRules
      const endRoleArg = 8;

      for (let i = startRoleArg; i <= endRoleArg; i++) {
        initializerArgs[i] = ZeroAddress;

        await expect(
          upgrades.deployProxy(YBS, initializerArgs, {
            initializer: "initialize",
          })
        ).to.be.revertedWithCustomError(YBS, "ZeroAddress");

        initializerArgs[i] = admin.address;
      }
    });

    it("cannot call initialize again after deployment", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      await expect(
        contract.initialize(
          NAME,
          SYMBOL,
          DECIMALS,
          admin.address,
          admin.address,
          admin.address,
          admin.address,
          admin.address,
          admin.address
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("has total supply", async function () {
      const { contract } = await loadFixture(deployYBSFixture);

      expect(await contract.totalSupply()).to.be.equal(100);
    });

    it("balanceOf", async function () {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      expect(await contract.balanceOf(admin.address)).to.be.equal(100);
    });
  });

  describe("Transfer", () => {
    it("transfers tokens to another account", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await expect(contract.transfer(addr1.address, 10))
        .to.emit(contract, "Transfer")
        .withArgs(admin.address, addr1.address, 10);

      expect(await contract.balanceOf(admin.address)).to.be.equal(90);
      expect(await contract.balanceOf(addr1.address)).to.be.equal(10);
    });

    it("reverts when the sender does not have enough balance", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await expect(contract.transfer(addr1.address, 101))
        .to.be.revertedWithCustomError(contract, "ERC20InsufficientBalance")
        .withArgs(admin.address, 100, 101);
    });

    it("reverts when the recipient is not the zero address", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      await expect(contract.transfer(ZeroAddress, 10))
        .to.be.revertedWithCustomError(contract, "ERC20InvalidReceiver")
        .withArgs(ZeroAddress);
    });

    it("reverts when the sender is a zero address", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);
      const signerZero = await ethers.getImpersonatedSigner(ZeroAddress);

      await admin.sendTransaction({
        to: signerZero.address,
        value: base,
      });

      await expect(
        (contract.connect(signerZero) as Contract).transfer(addr1.address, 1)
      )
        .to.be.revertedWithCustomError(contract, "ERC20InvalidSender")
        .withArgs(ZeroAddress);
    });
  });

  describe("Approve", () => {
    const amount = 10;

    it("reverts when sender is a zero address", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);
      const signerZero = await ethers.getImpersonatedSigner(ZeroAddress);

      await admin.sendTransaction({
        to: signerZero.address,
        value: base,
      });

      await expect(
        (contract.connect(signerZero) as Contract).approve(addr1.address, 1)
      )
        .to.revertedWithCustomError(contract, "ERC20InvalidApprover")
        .withArgs(ZeroAddress);
    });

    it("reverts when spender is a zero address", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      await expect(contract.approve(ZeroAddress, 1))
        .to.revertedWithCustomError(contract, "ERC20InvalidSpender")
        .withArgs(ZeroAddress);
    });

    it("gives an allowance", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await expect(contract.approve(addr1.address, amount))
        .to.emit(contract, "Approval")
        .withArgs(admin.address, addr1.address, amount);

      expect(await contract.allowance(admin.address, addr1.address)).to.equal(
        amount
      );
    });

    it("multiple approves", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, amount + 1);
      await contract.approve(addr1.address, amount);

      expect(await contract.allowance(admin.address, addr1.address)).to.equal(
        amount
      );
    });
  });

  describe("Increase Approval", () => {
    const amount = 10;

    it("approves the requested amount", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await expect(contract.increaseApproval(addr1.address, amount))
        .to.emit(contract, "Approval")
        .withArgs(admin.address, addr1.address, amount);

      expect(await contract.allowance(admin.address, addr1.address)).to.equal(
        amount
      );
    });

    it("increases the spender allowance adding the requested amount", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, amount);
      await contract.increaseApproval(addr1.address, amount);

      expect(await contract.allowance(admin.address, addr1.address)).to.equal(
        amount * 2
      );
    });

    it("reverts when sender is a zero address", async () => {
      const { contract, admin } = await loadFixture(deployYBSFixture);

      const signerZero = await ethers.getImpersonatedSigner(ZeroAddress);

      await admin.sendTransaction({
        to: signerZero.address,
        value: base,
      });

      await expect(
        (contract.connect(signerZero) as Contract).increaseApproval(
          ZeroAddress,
          amount
        )
      )
        .to.be.revertedWithCustomError(contract, "ERC20InvalidApprover")
        .withArgs(ZeroAddress);
    });

    it("reverts when spender is a zero address", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      await expect(contract.increaseApproval(ZeroAddress, amount))
        .to.be.revertedWithCustomError(contract, "ERC20InvalidSpender")
        .withArgs(ZeroAddress);
    });
  });

  describe("Decrease Approval", () => {
    it("decreases the spender allowance subtracting the requested amount", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);
      const spender = addr1.address;
      const amount = 2;
      const subtractedAmount = 1;

      await contract.approve(spender, amount);
      await expect(contract.decreaseApproval(spender, subtractedAmount))
        .to.emit(contract, "Approval")
        .withArgs(admin.address, spender, amount - subtractedAmount);

      expect(await contract.allowance(admin.address, spender)).to.be.equal(
        amount - subtractedAmount
      );
    });

    it("sets allowance to zero when all allowance is removed", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);
      const spender = addr1.address;
      const amount = 1;
      const subtractedAmount = 1;

      await contract.approve(spender, amount);
      await contract.decreaseApproval(spender, subtractedAmount);

      expect(await contract.allowance(admin.address, spender)).to.be.equal(0);
    });

    it("sets to zero when more than the allowance is subtracted", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);
      const spender = addr1.address;
      const amount = 1;

      await contract.approve(spender, amount);

      await contract.decreaseApproval(spender, amount + 1);

      expect(await contract.allowance(admin.address, spender)).to.be.equal(0);
    });
  });

  describe("TransferFrom", () => {
    const amount = 10;

    it("transfers the full allowance", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, amount);

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(
          admin.address,
          addr1.address,
          amount
        )
      ).to.changeTokenBalances(
        contract,
        [admin.address, addr1.address],
        [-amount, amount]
      );
    });

    it("decreases the spender allowance", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, 2);
      await (contract.connect(addr1) as Contract).transferFrom(
        admin.address,
        addr1.address,
        1
      );

      expect(
        await contract.allowance(admin.address, addr1.address)
      ).to.be.equal(1);
    });

    it("emits a transfer event", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, amount);

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(
          admin.address,
          addr1.address,
          amount
        )
      )
        .to.emit(contract, "Transfer")
        .withArgs(admin.address, addr1.address, amount);
    });

    it("unlimited allowance does not decrease", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, MaxUint256);

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(
          admin.address,
          addr1.address,
          1
        )
      ).to.not.emit(contract, "Approval");

      expect(
        await contract.allowance(admin.address, addr1.address)
      ).to.be.equal(MaxUint256);
    });

    it("reverts when spender has insufficient allowance", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);

      await contract.approve(addr1.address, amount);

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(
          admin.address,
          addr1.address,
          amount + 1
        )
      )
        .to.be.revertedWithCustomError(contract, "ERC20InsufficientAllowance")
        .withArgs(addr1.address, amount, amount + 1);
    });

    it("reverts when spender has enough allowance but not have enough sender balance", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);
      await contract.approve(addr1.address, MaxUint256);

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(
          admin.address,
          addr1.address,
          101
        )
      )
        .to.be.revertedWithCustomError(contract, "ERC20InsufficientBalance")
        .withArgs(admin.address, 100, 101);
    });

    it("reverts when recipient is a zero address", async () => {
      const { contract, admin, addr1 } = await loadFixture(deployYBSFixture);
      await contract.approve(addr1.address, amount);

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(
          admin.address,
          ZeroAddress,
          amount
        )
      )
        .to.be.revertedWithCustomError(contract, "ERC20InvalidReceiver")
        .withArgs(ZeroAddress);
    });
  });
});
