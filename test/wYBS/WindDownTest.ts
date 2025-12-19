import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits, Contract } from "ethers";

import { deployWrappedYBSFixture } from "../helpers/fixtures";
import { W_CONTRACT_NAME } from "../helpers/constants";

describe("wYBS Wind Down", function () {
  const initialAmount = parseUnits("10.0", 18);
  const depositAmount = parseUnits("5.0", 18);
  const newAssetDecimals = 6;
  const newAssetAmount = parseUnits("1000.0", newAssetDecimals);

  async function deployMockERC20Fixture() {
    const [deployer] = await ethers.getSigners();
    
    // Deploy a mock ERC20 token with 6 decimals to simulate USDG/PYUSD
    const MockERC20 = await ethers.getContractFactory("ERC20Mock");
    const mockERC20 = await MockERC20.deploy(
      "Mock USDG",
      "USDG",
      newAssetDecimals
    );
    
    // Mint some tokens to the deployer
    await mockERC20.mint(deployer.address, newAssetAmount);
    
    return { mockERC20, deployer };
  }

  async function deployUpgradedWYBSFixture() {
    const { contract, ybsContract, admin, addr1 } = await loadFixture(deployWrappedYBSFixture);
    const { mockERC20 } = await loadFixture(deployMockERC20Fixture);
    
    // Deposit some USDL into the vault
    await ybsContract.increaseSupply(initialAmount);
    await ybsContract.approve(await contract.getAddress(), initialAmount);
    await contract.deposit(depositAmount, addr1.address);
    
    // Get the conversion rate before upgrade (1 wUSDL in USDL terms)
    const usdlPerShare = await contract.convertToAssets(parseUnits("1.0", 18));
    
    // Upgrade to wYBSV2 and initialize in the same transaction
    const WYBSV2 = await ethers.getContractFactory("wYBSV2");
    const wybsV2Impl = await WYBSV2.deploy();
    
    // Encode the initializeV2 function call
    const wybsV2Interface = WYBSV2.interface;
    const initData = wybsV2Interface.encodeFunctionData("initializeV2", [await mockERC20.getAddress()]);
    
    // Upgrade and initialize in one transaction
    await contract.upgradeToAndCall(await wybsV2Impl.getAddress(), initData);
    
    // Get the upgraded contract instance
    const wybsV2 = WYBSV2.attach(await contract.getAddress());
    
    // Calculate how much new asset is needed based on total shares
    const totalShares = await wybsV2.totalSupply();
    const requiredNewAsset = await wybsV2.convertToAssets(totalShares);
    
    // Transfer enough new asset to the contract to back the vault
    await mockERC20.transfer(await contract.getAddress(), requiredNewAsset);
    
    return { 
      contract: wybsV2, 
      ybsContract, 
      newAsset: mockERC20,
      admin, 
      addr1,
      usdlPerShare
    };
  }

  describe("Upgrade and Migration", function () {
    it("should upgrade from wYBSV1 to wYBSV2", async function () {
      const { contract } = await loadFixture(deployWrappedYBSFixture);
      const { mockERC20 } = await loadFixture(deployMockERC20Fixture);
      
      // Upgrade and initialize in one transaction
      const WYBSV2 = await ethers.getContractFactory("wYBSV2");
      const wybsV2Impl = await WYBSV2.deploy();
      
      // Encode the initializeV2 function call
      const wybsV2Interface = WYBSV2.interface;
      const initData = wybsV2Interface.encodeFunctionData("initializeV2", [await mockERC20.getAddress()]);
      
      await contract.upgradeToAndCall(await wybsV2Impl.getAddress(), initData);
      
      // After upgrade and initialization, should use new asset
      expect(await contract.asset()).to.equal(await mockERC20.getAddress());
      // Decimals should change to match new asset (6)
      expect(await contract.decimals()).to.equal(newAssetDecimals);
    });

    it("should revert if initializeV2 is called with zero address", async function () {
      const { contract } = await loadFixture(deployWrappedYBSFixture);
      
      const WYBSV2 = await ethers.getContractFactory("wYBSV2");
      const wybsV2Impl = await WYBSV2.deploy();
      
      // Encode the initializeV2 function call with zero address
      const wybsV2Interface = WYBSV2.interface;
      const initData = wybsV2Interface.encodeFunctionData("initializeV2", [ethers.ZeroAddress]);
      
      // Should revert when upgrading with zero address
      await expect(
        contract.upgradeToAndCall(await wybsV2Impl.getAddress(), initData)
      ).to.be.revertedWithCustomError(WYBSV2, "ZeroAddress");
    });

    it("should revert if initializeV2 is called twice", async function () {
      const { contract } = await loadFixture(deployUpgradedWYBSFixture);
      const { mockERC20 } = await loadFixture(deployMockERC20Fixture);
      
      // Should revert on second call
      await expect(contract.initializeV2(mockERC20)).to.be.reverted;
    });
  });

  describe("Deposits Disabled", function () {
    it("should revert on deposit after migration", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      await expect(
        contract.deposit(parseUnits("1.0", newAssetDecimals), addr1.address)
      ).to.be.revertedWithCustomError(contract, "DepositsDisabled");
    });

    it("should revert on mint after migration", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      await expect(
        contract.mint(parseUnits("1.0", 18), addr1.address)
      ).to.be.revertedWithCustomError(contract, "DepositsDisabled");
    });

    it("should return 0 for maxDeposit after migration", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      expect(await contract.maxDeposit(addr1.address)).to.equal(0);
    });

    it("should return 0 for maxMint after migration", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      expect(await contract.maxMint(addr1.address)).to.equal(0);
    });
  });

  describe("Withdrawals and Redemptions", function () {
    it("should allow withdrawal of new asset after migration", async function () {
      const { contract, newAsset, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // balanceOf still returns 18 decimals (internal storage)
      const shares = await contract.balanceOf(addr1.address);
      const expectedNewAssetAmount = await contract.previewRedeem(shares);
      const balanceBefore = await newAsset.balanceOf(addr1.address);
      
      // Withdraw
      await contract.connect(addr1).withdraw(
        expectedNewAssetAmount,
        addr1.address,
        addr1.address
      );
      
      // Should receive new asset
      const balanceAfter = await newAsset.balanceOf(addr1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedNewAssetAmount);
      
      // Shares should be burned
      expect(await contract.balanceOf(addr1.address)).to.equal(0);
    });

    it("should allow redemption of new asset after migration", async function () {
      const { contract, newAsset, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // balanceOf still returns 18 decimals (internal storage)
      const shares = await contract.balanceOf(addr1.address);
      const expectedNewAssetAmount = await contract.previewRedeem(shares);
      const balanceBefore = await newAsset.balanceOf(addr1.address);
      
      // Redeem
      await contract.connect(addr1).redeem(shares, addr1.address, addr1.address);
      
      // Should receive new asset
      const balanceAfter = await newAsset.balanceOf(addr1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedNewAssetAmount);
      
      // Shares should be burned
      expect(await contract.balanceOf(addr1.address)).to.equal(0);
    });

    it("should use correct conversion rate for redemptions", async function () {
      const { contract, usdlPerShare } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Conversion rate should be based on USDL per share at upgrade time
      const oneShare = parseUnits("1.0", 18);
      const expectedNewAssetAmount = (usdlPerShare * BigInt(10 ** newAssetDecimals)) / BigInt(10 ** 18);
      
      const actualNewAssetAmount = await contract.convertToAssets(oneShare);
      
      // Should match the expected conversion (within rounding)
      expect(actualNewAssetAmount).to.be.closeTo(expectedNewAssetAmount, BigInt(10 ** (newAssetDecimals - 3)));
    });

    it("should maintain conversion rate consistency", async function () {
      const { contract } = await loadFixture(deployUpgradedWYBSFixture);
      
      const shares = parseUnits("10.0", 18);
      const assets = await contract.convertToAssets(shares);
      const sharesBack = await contract.convertToShares(assets);
      
      // Should be able to convert back and forth (within rounding)
      expect(sharesBack).to.be.closeTo(shares, BigInt(10 ** 15));
    });

    it("should preserve redeem amount value before and after upgrade", async function () {
      const { contract, ybsContract } = await loadFixture(deployWrappedYBSFixture);
      const { mockERC20 } = await loadFixture(deployMockERC20Fixture);
      
      // Deposit some USDL into the vault
      await ybsContract.increaseSupply(initialAmount);
      await ybsContract.approve(await contract.getAddress(), initialAmount);
      const [addr1] = await ethers.getSigners();
      await contract.deposit(depositAmount, addr1.address);
      
      // Get shares and preview redeem amount BEFORE upgrade (in USDL, 18 decimals)
      const shares = await contract.balanceOf(addr1.address);
      const usdlRedeemAmount = await contract.previewRedeem(shares);
      
      // Upgrade to wYBSV2 and initialize in the same transaction
      const WYBSV2 = await ethers.getContractFactory("wYBSV2");
      const wybsV2Impl = await WYBSV2.deploy();
      
      // Encode the initializeV2 function call
      const wybsV2Interface = WYBSV2.interface;
      const initData = wybsV2Interface.encodeFunctionData("initializeV2", [await mockERC20.getAddress()]);
      
      // Upgrade and initialize in one transaction
      await contract.upgradeToAndCall(await wybsV2Impl.getAddress(), initData);
      
      const wybsV2 = WYBSV2.attach(await contract.getAddress());
      
      // Transfer new asset to the contract to back the vault
      const totalShares = await wybsV2.totalSupply();
      const requiredNewAsset = await wybsV2.convertToAssets(totalShares);
      const extraAmount = parseUnits("100.0", newAssetDecimals);
      await mockERC20.transfer(await contract.getAddress(), requiredNewAsset + extraAmount);
      
      // Preview redeem amount AFTER upgrade (in new asset, 6 decimals)
      const newAssetRedeemAmount = await wybsV2.previewRedeem(shares);
      
      // Convert USDL amount (18 decimals) to new asset amount (6 decimals) for comparison
      // USDL: 18 decimals, new asset: 6 decimals
      // So we divide by 1e12 to convert from 18 to 6 decimals
      const usdlRedeemAmountIn6Decimals = usdlRedeemAmount / BigInt(10 ** (18 - newAssetDecimals));
      
      // The amounts should be equal (within rounding tolerance)
      // Allow for rounding differences (1 unit in 6 decimals = 1e12 in 18 decimals)
      expect(newAssetRedeemAmount).to.be.closeTo(usdlRedeemAmountIn6Decimals, BigInt(1));
    });
  });

  describe("Double Redemption Prevention", function () {
    it("should prevent double redemption - balance is zero after full redemption", async function () {
      const { contract, newAsset, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Get initial balance
      const shares = await contract.balanceOf(addr1.address);
      expect(shares).to.be.gt(0);
      
      const expectedNewAssetAmount = await contract.previewRedeem(shares);
      const balanceBefore = await newAsset.balanceOf(addr1.address);
      
      // Full redemption
      await contract.connect(addr1).redeem(shares, addr1.address, addr1.address);
      
      // Balance should be zero
      expect(await contract.balanceOf(addr1.address)).to.equal(0);
      
      // Should receive new asset
      const balanceAfter = await newAsset.balanceOf(addr1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedNewAssetAmount);
      
      // Second redeem attempt should fail
      await expect(
        contract.connect(addr1).redeem(shares, addr1.address, addr1.address)
      ).to.be.reverted;
    });

    it("should prevent double redemption - only remaining shares can be redeemed after partial redemption", async function () {
      const { contract, newAsset, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Get initial balance
      const totalShares = await contract.balanceOf(addr1.address);
      const partialShares = totalShares / 2n;
      const remainingShares = totalShares - partialShares;
      
      // Partial redemption
      const expectedPartialAssets = await contract.previewRedeem(partialShares);
      const balanceBefore = await newAsset.balanceOf(addr1.address);
      
      await contract.connect(addr1).redeem(partialShares, addr1.address, addr1.address);
      
      // Balance should be reduced
      expect(await contract.balanceOf(addr1.address)).to.equal(remainingShares);
      
      // Should receive partial new asset
      const balanceAfter = await newAsset.balanceOf(addr1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedPartialAssets);
      
      // Can redeem remaining shares
      const expectedRemainingAssets = await contract.previewRedeem(remainingShares);
      await contract.connect(addr1).redeem(remainingShares, addr1.address, addr1.address);
      
      // Balance should now be zero
      expect(await contract.balanceOf(addr1.address)).to.equal(0);
      
      // Should receive remaining new asset
      const finalBalance = await newAsset.balanceOf(addr1.address);
      expect(finalBalance - balanceAfter).to.equal(expectedRemainingAssets);
      
      // Cannot redeem more than remaining
      await expect(
        contract.connect(addr1).redeem(1, addr1.address, addr1.address)
      ).to.be.reverted;
    });

    it("should return zero for maxRedeem after full redemption", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Get initial balance
      const shares = await contract.balanceOf(addr1.address);
      
      // Before redemption, maxRedeem should return shares
      expect(await contract.maxRedeem(addr1.address)).to.equal(shares);
      
      // Full redemption
      await contract.connect(addr1).redeem(shares, addr1.address, addr1.address);
      
      // After redemption, maxRedeem should return zero
      expect(await contract.maxRedeem(addr1.address)).to.equal(0);
    });

    it("should revert when attempting to redeem more shares than owned", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Get initial balance
      const shares = await contract.balanceOf(addr1.address);
      
      // Attempt to redeem more than owned
      await expect(
        contract.connect(addr1).redeem(shares + 1n, addr1.address, addr1.address)
      ).to.be.reverted;
      
      // Balance should remain unchanged
      expect(await contract.balanceOf(addr1.address)).to.equal(shares);
    });

    it("should prevent double redemption after full withdrawal", async function () {
      const { contract, newAsset, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Get initial balance
      const maxWithdrawAmount = await contract.maxWithdraw(addr1.address);
      const balanceBefore = await newAsset.balanceOf(addr1.address);
      
      // Full withdrawal
      await contract.connect(addr1).withdraw(
        maxWithdrawAmount,
        addr1.address,
        addr1.address
      );
      
      // Balance should be zero
      expect(await contract.balanceOf(addr1.address)).to.equal(0);
      
      // Should receive new asset
      const balanceAfter = await newAsset.balanceOf(addr1.address);
      expect(balanceAfter - balanceBefore).to.equal(maxWithdrawAmount);
      
      // Attempt to redeem after withdrawal should fail
      await expect(
        contract.connect(addr1).redeem(1, addr1.address, addr1.address)
      ).to.be.reverted;
      
      // Attempt to withdraw after full withdrawal should fail
      await expect(
        contract.connect(addr1).withdraw(1, addr1.address, addr1.address)
      ).to.be.reverted;
    });
  });

  describe("Asset Management", function () {
    it("should return new asset address after migration", async function () {
      const { contract, newAsset } = await loadFixture(deployUpgradedWYBSFixture);
      
      expect(await contract.asset()).to.equal(await newAsset.getAddress());
    });

    it("should return new asset balance in totalAssets", async function () {
      const { contract, newAsset } = await loadFixture(deployUpgradedWYBSFixture);
      
      const balance = await newAsset.balanceOf(await contract.getAddress());
      expect(await contract.totalAssets()).to.equal(balance);
    });

    it("should change wUSDL decimals to match new asset", async function () {
      const { contract } = await loadFixture(deployUpgradedWYBSFixture);
      
      // wUSDL decimals should change to match new asset decimals (6) after migration
      expect(await contract.decimals()).to.equal(newAssetDecimals);
    });
  });

  describe("Existing Functionality Preserved", function () {
    it("should preserve blocklist functionality", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Block an account
      await contract.blockAccounts([addr1.address]);
      expect(await contract.isAddrBlocked(addr1.address)).to.be.true;
      
      // Unblock
      await contract.unblockAccounts([addr1.address]);
      expect(await contract.isAddrBlocked(addr1.address)).to.be.false;
    });

    it("should preserve pause functionality", async function () {
      const { contract, admin } = await loadFixture(deployUpgradedWYBSFixture);
      
      // Pause
      await contract.pause();
      expect(await contract.paused()).to.be.true;
      
      // Unpause
      await contract.unpause();
      expect(await contract.paused()).to.be.false;
    });
  });

  describe("seizeAssets After Migration", function () {
    it("should preserve seizeAssets functionality", async function () {
      const { contract, newAsset, admin, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      
      // balanceOf still returns 18 decimals (internal storage)
      const shares = await contract.balanceOf(addr1.address);
      
      // Block and seize
      await contract.blockAccounts([addr1.address]);
      const expectedAssets = await contract.previewRedeem(shares);
      const adminBalanceBefore = await newAsset.balanceOf(admin.address);
      
      await contract.seizeAssets(addr1.address, admin.address);
      
      // Admin should receive new asset
      const adminBalanceAfter = await newAsset.balanceOf(admin.address);
      expect(adminBalanceAfter - adminBalanceBefore).to.equal(expectedAssets);
      // Shares should be burned
      expect(await contract.balanceOf(addr1.address)).to.equal(0);
    });

    it("should revert when address is not blocked", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployUpgradedWYBSFixture);

      await expect(
        contract.seizeAssets(addr1.address, admin.address)
      ).to.be.revertedWithCustomError(contract, "AccountNotBlocked");
    });
    
    it("should revert when receiving address is blocked", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      const [, , addr2] = await ethers.getSigners();

      // Transfer some shares to addr2 and block both
      const shares = await contract.balanceOf(addr1.address);
      await contract.connect(addr1).transfer(addr2.address, shares / 2n);
      await contract.blockAccounts([addr1.address, addr2.address]);

      await expect(
        contract.seizeAssets(addr1.address, addr2.address)
      ).to.be.revertedWithCustomError(contract, "BlockedAccountReceiver");
    });

    it("should correctly transfer new asset (not USDL) to receiver", async function () {
      const { contract, newAsset, ybsContract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      const [, , addr2] = await ethers.getSigners();

      // Transfer some shares to addr2
      const shares = await contract.balanceOf(addr1.address);
      await contract.connect(addr1).transfer(addr2.address, shares / 2n);
      await contract.blockAccounts([addr2.address]);

      const seizedShares = await contract.balanceOf(addr2.address);
      const expectedNewAssets = await contract.previewRedeem(seizedShares);
      const receiverBalanceBefore = await newAsset.balanceOf(addr1.address);
      const usdlBalanceBefore = await ybsContract.balanceOf(addr1.address);

      await contract.seizeAssets(addr2.address, addr1.address);

      // Receiver should receive new asset
      const receiverBalanceAfter = await newAsset.balanceOf(addr1.address);
      expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(expectedNewAssets);
      
      // Receiver should NOT receive USDL (old asset)
      const usdlBalanceAfter = await ybsContract.balanceOf(addr1.address);
      expect(usdlBalanceAfter - usdlBalanceBefore).to.equal(0);
      
      // Shares should be burned
      expect(await contract.balanceOf(addr2.address)).to.equal(0);
    });

    it("should work when contract is paused", async function () {
      const { contract, newAsset, admin, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      const [, , addr2] = await ethers.getSigners();

      // Transfer some shares to addr2
      const shares = await contract.balanceOf(addr1.address);
      await contract.connect(addr1).transfer(addr2.address, shares / 2n);
      await contract.blockAccounts([addr2.address]);
      await contract.pause(); // Pause the contract

      const seizedShares = await contract.balanceOf(addr2.address);
      const expectedNewAssets = await contract.previewRedeem(seizedShares);
      const receiverBalanceBefore = await newAsset.balanceOf(addr1.address);

      await expect(contract.seizeAssets(addr2.address, addr1.address))
        .to.emit(contract, "Transfer")
        .withArgs(addr2.address, ethers.ZeroAddress, seizedShares)
        .to.emit(contract, "Withdraw")
        .withArgs(admin.address, addr1.address, addr2.address, expectedNewAssets, seizedShares)
        .to.emit(contract, "BlockedAccountWiped")
        .withArgs(addr2.address);

      expect(await contract.isAddrBlocked(addr2.address)).to.be.true;
      expect(await contract.balanceOf(addr2.address)).to.equal(0);
      
      const receiverBalanceAfter = await newAsset.balanceOf(addr1.address);
      expect(receiverBalanceAfter - receiverBalanceBefore).to.equal(expectedNewAssets);
    });

    it("should correctly calculate assets using new conversion logic", async function () {
      const { contract, newAsset, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      const [, , addr2] = await ethers.getSigners();

      // Transfer some shares to addr2
      const shares = await contract.balanceOf(addr1.address);
      await contract.connect(addr1).transfer(addr2.address, shares / 2n);
      await contract.blockAccounts([addr2.address]);

      const seizedShares = await contract.balanceOf(addr2.address);
      // Use convertToAssets to verify the conversion logic
      const expectedAssetsViaConversion = await contract.convertToAssets(seizedShares);
      const expectedAssetsViaPreview = await contract.previewRedeem(seizedShares);
      
      // Both should match (within rounding)
      expect(expectedAssetsViaPreview).to.be.closeTo(expectedAssetsViaConversion, BigInt(1));

      const receiverBalanceBefore = await newAsset.balanceOf(addr1.address);
      await contract.seizeAssets(addr2.address, addr1.address);
      const receiverBalanceAfter = await newAsset.balanceOf(addr1.address);

      // The actual transferred amount should match the expected (within rounding)
      const actualTransferred = receiverBalanceAfter - receiverBalanceBefore;
      expect(actualTransferred).to.be.closeTo(expectedAssetsViaPreview, BigInt(1));
    });

    it("should emit correct events with new asset amounts", async function () {
      const { contract, admin, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      const [, , addr2] = await ethers.getSigners();

      // Transfer some shares to addr2
      const shares = await contract.balanceOf(addr1.address);
      await contract.connect(addr1).transfer(addr2.address, shares / 2n);
      await contract.blockAccounts([addr2.address]);

      const seizedShares = await contract.balanceOf(addr2.address);
      const expectedNewAssets = await contract.previewRedeem(seizedShares);

      await expect(contract.seizeAssets(addr2.address, addr1.address))
        .to.emit(contract, "Transfer")
        .withArgs(addr2.address, ethers.ZeroAddress, seizedShares)
        .to.emit(contract, "Withdraw")
        .withArgs(admin.address, addr1.address, addr2.address, expectedNewAssets, seizedShares)
        .to.emit(contract, "BlockedAccountWiped")
        .withArgs(addr2.address);
    });

    it("should only work with ASSET_PROTECTION_ROLE", async function () {
      const { contract, addr1 } = await loadFixture(deployUpgradedWYBSFixture);
      const [, , addr2] = await ethers.getSigners();

      // Transfer some shares to addr2
      const shares = await contract.balanceOf(addr1.address);
      await contract.connect(addr1).transfer(addr2.address, shares / 2n);
      await contract.blockAccounts([addr2.address]);

      // addr1 does not have ASSET_PROTECTION_ROLE
      await expect(
        contract.connect(addr1).seizeAssets(addr2.address, addr1.address)
      ).to.be.revertedWith(
        `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${await contract.ASSET_PROTECTION_ROLE()}`
      );
    });
  });
});

