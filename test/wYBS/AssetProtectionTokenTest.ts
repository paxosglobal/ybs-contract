import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, MaxUint256, ZeroAddress } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { W_NAME, W_SYMBOL, W_CONTRACT_NAME } from "../helpers/constants";
import { deployYBSFixture } from "../helpers/fixtures";

describe("wYBS Asset Protection", function () {
  const amount = 10;

  async function deployWrappedYBSFixture() {
    let { contract } = await loadFixture(deployYBSFixture);
    const ybsContract = contract;
  
    const [admin, addr1, addr2, addr3, blockedAddr] = await ethers.getSigners();
    const initializerArgs = [
      W_NAME,
      W_SYMBOL,
      await ybsContract.getAddress(),
      admin.address,
      admin.address,
      admin.address,
    ];
  
    const YBS = await ethers.getContractFactory(W_CONTRACT_NAME);
    const wYbsContract = await upgrades.deployProxy(YBS, initializerArgs, {
      initializer: "initialize",
    });
  
    await ybsContract.approve(await wYbsContract.getAddress(), 100);
    await wYbsContract.mint(100, admin.address);
    contract = wYbsContract

    await (contract.connect(blockedAddr) as Contract).approve(admin.address, amount);
    await (contract.connect(blockedAddr) as Contract).approve(addr1.address, amount); 
    await (contract.connect(addr1) as Contract).approve(admin.address, amount); 
    await (contract.connect(addr1) as Contract).approve(blockedAddr.address, MaxUint256); 


    await contract.transfer(blockedAddr.address, amount);
    await contract.blockAccounts([blockedAddr.address]);

    return { contract, ybsContract, admin, addr1, addr2, addr3, blockedAddr };
  }

  describe("Blocklist test suite", () => {

    it("blocks single account", async () => {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await expect(contract.blockAccounts([addr1.address]))
        .to.emit(contract, "AccountBlocked")
        .withArgs(addr1.address);

      expect(await contract.isAddrBlocked(addr1.address)).to.be.true;
    });

    it("blocks multiples accounts", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await contract.blockAccounts([addr1.address, addr2.address]);

      const result = await Promise.all([
        contract.isAddrBlocked(addr1.address),
        contract.isAddrBlocked(addr2.address),
      ]);

      expect(result.every(Boolean)).to.be.true;
    });

    it("unblocks single account", async () => {
      const { contract, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await contract.blockAccounts([addr1.address]);
      await expect(contract.unblockAccounts([addr1.address]))
        .to.emit(contract, "AccountUnblocked")
        .withArgs(addr1.address);

      expect(await contract.isAddrBlocked(addr1.address)).to.be.false;
    });

    it("unblocks multiples accounts", async () => {
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

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
        deployWrappedYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).transfer(
          addr1.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when transfer is to blocked address", async function () {
      const { contract, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      await expect(
        contract.transfer(blockedAddr.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("reverts when transferFrom is by blocked address", async function () {
      const { contract, addr1, addr2, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      await contract.transfer(addr1.address, amount);

      await expect(
        (contract.connect(blockedAddr) as Contract).transferFrom(
          addr1.address,
          addr2.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts when transferFrom is from blocked address", async function () {
      const { contract, addr1, addr2, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      await expect(
        (contract.connect(addr1) as Contract).transferFrom(blockedAddr.address, addr2.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when transferFrom is to blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      contract.transfer(addr1.address, amount)

      await expect(
        contract.transferFrom(addr1.address, blockedAddr.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("admin cannot transferFrom with blocked from address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      await expect(
        contract.transferFrom(blockedAddr.address, addr1.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when approve is from the blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).approve(
          addr1.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when approve spender is the blocked address", async function () {
      const { contract, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        contract.approve(blockedAddr, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts when increase approval is from the blocked address", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).increaseAllowance(
          addr1.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when increase approve spender is the blocked address", async function () {
      const { contract, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        contract.increaseAllowance(blockedAddr.address, amount)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts when decrease approval is from the blocked address", async function () {
      const { contract, admin, blockedAddr } = await loadFixture(
        deployWrappedYBSFixture
      );

      await expect(
        (contract.connect(blockedAddr) as Contract).decreaseAllowance(
          admin.address,
          amount
        )
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("allow decrease approval when spender is the blocked address", async function () {
      const { contract, blockedAddr, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        (contract.connect(addr1) as Contract).decreaseAllowance(blockedAddr.address, amount)
      ).to.not.be.reverted;
    });

    it("unblocked address can transfer again", async function () {
      const { contract, blockedAddr, addr1 } = await loadFixture(
        deployWrappedYBSFixture
      );
      const beforeBal = await contract.balanceOf(blockedAddr.address);
      await contract.unblockAccounts([blockedAddr.address]);

      await expect(contract.transfer(blockedAddr, amount)).to.not.reverted;
      expect(await contract.balanceOf(blockedAddr.address) - beforeBal).to.be.equal(amount);

      await expect(
        (contract.connect(blockedAddr) as Contract).transfer(addr1, amount)
      ).to.not.reverted;
      expect(await contract.balanceOf(blockedAddr)).to.be.equal(beforeBal);
    });

    it("reverts when depositing to blocked account", async function () {
      const { contract, ybsContract, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await ybsContract.increaseSupply(10);
      await ybsContract.approve(await contract.getAddress(), 10);

      await expect(
        contract.deposit(10, blockedAddr.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("reverts when blocked account calls deposit", async function () {
      const { contract, ybsContract, blockedAddr, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await ybsContract.increaseSupply(10);
      await ybsContract.transfer(blockedAddr.address, 10);

      await expect(
        (contract.connect(blockedAddr) as Contract).deposit(10, addr1.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts when redeeming to blocked account", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await contract.transfer(addr1.address, 10);

      await expect(
        (contract.connect(addr1) as Contract).redeem(10, blockedAddr.address, addr1.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("reverts when blocked account calls redeem", async function () {
      const { contract, addr1, addr2, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await contract.transfer(addr1.address, 10);

      await expect(
        (contract.connect(blockedAddr) as Contract).redeem(10, addr2.address, addr1.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts on redeem when called by unblocked account, but owner is blocked", async function () {
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await contract.transfer(addr1.address, 10);
      await (contract.connect(addr1) as Contract).approve(addr2.address, 10);
      await contract.blockAccounts([addr1.address]);

      await expect(
        (contract.connect(addr2) as Contract).redeem(10, addr2.address, addr1.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts on redeem when called by blocked account and owner is blocked", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        (contract.connect(blockedAddr) as Contract).redeem(10, addr1.address, blockedAddr.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts on redeem when called by ASSET_PROTECTION_ROLE", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        contract.redeem(10, addr1.address, blockedAddr.address)
      ).to.be.revertedWithCustomError(contract, "InvalidOperation");
    });

    it("reverts on withdraw when called by ASSET_PROTECTION_ROLE", async function () {
      const { contract, addr1, blockedAddr } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        contract.withdraw(10, addr1.address, blockedAddr.address)
      ).to.be.revertedWithCustomError(contract, "InvalidOperation");
    });
  });

  describe("seizeAssets", function () {
    const amount = 10;

    it("reverts when address is not blocked", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);

      await expect(
        contract.seizeAssets(addr1.address, admin.address)
      ).to.be.revertedWithCustomError(contract, "AccountNotBlocked");
    });
    
    it("reverts when receiving address is blocked", async function () {
      const { contract, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await contract.blockAccounts([addr1.address, addr2.address]);

      await expect(
        contract.seizeAssets(addr1.address, addr2.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("wipes a frozen address balance and transfers assets to admin", async function () {
      const { contract, ybsContract, admin, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await contract.transfer(addr2, amount);
      await contract.blockAccounts([addr2.address]);

      const seizedAssets = await contract.previewRedeem(amount);

      await expect(contract.seizeAssets(addr2.address, addr1.address))
        .to.emit(contract, "Transfer")
        .withArgs(addr2.address, ZeroAddress, amount)
        .to.emit(contract, "Withdraw")
        .withArgs(admin.address, addr1.address, addr2.address, seizedAssets, amount)
        .to.emit(contract, "BlockedAccountWiped")
        .withArgs(addr2.address);

      expect(await contract.isAddrBlocked(addr2.address)).to.be.true;
      expect(await contract.balanceOf(addr2.address)).to.be.equal(0);
      expect(await ybsContract.balanceOf(addr1.address)).to.be.equal(seizedAssets);
    });

    it("wipes a frozen address balance and transfers assets to admin when paused", async function () {
      const { contract, ybsContract, admin, addr1, addr2 } = await loadFixture(deployWrappedYBSFixture);

      await contract.transfer(addr2, amount);
      await contract.blockAccounts([addr2.address]);
      await contract.pause(); // allow while in paused state

      const seizedAssets = await contract.previewRedeem(amount);

      await expect(contract.seizeAssets(addr2.address, addr1.address))
        .to.emit(contract, "Transfer")
        .withArgs(addr2.address, ZeroAddress, amount)
        .to.emit(contract, "Withdraw")
        .withArgs(admin.address, addr1.address, addr2.address, seizedAssets, amount)
        .to.emit(contract, "BlockedAccountWiped")
        .withArgs(addr2.address);

      expect(await contract.isAddrBlocked(addr2.address)).to.be.true;
      expect(await contract.balanceOf(addr2.address)).to.be.equal(0);
      expect(await ybsContract.balanceOf(addr1.address)).to.be.equal(seizedAssets);
    });
  });
});
