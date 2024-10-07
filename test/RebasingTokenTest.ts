import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits, MaxUint256 } from "ethers";

import { CONTRACT_NAME } from "./helpers/constants";
import { getBlockTimestamp } from "./helpers/commonutil";

describe("YBS Rebasing Token", function () {
  const name = "Yield Bearing Stablecoin";
  const symbol = "YBS";
  const decimals = 18;
  const totalSupply = parseUnits("123");
  const maxRebaseRate = parseUnits("1");
  const rebasePeriod = 10

  async function deployYBSFixture() {
    const [admin, addr1, addr2] = await ethers.getSigners();

    const initializerArgs = [
      name,
      symbol,
      decimals,
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

    await contract.increaseSupply(totalSupply);
    await contract.setRebasePeriod(rebasePeriod);
    await contract.setMaxRebaseRate(maxRebaseRate);

    return { contract, admin, addr1, addr2 };
  }

  describe("Rebasing", () => {
    const base = parseUnits("1");
    const wei = parseUnits("0.000000000000000001");
    const afterIncrMult = parseUnits("1.0002");
    const newAfterIncrMult = parseUnits("1.0003");
    const rebaseRate = parseUnits("0.2");
    const amount = parseUnits("123");
    const afterIncrTotalSupply = (totalSupply * (afterIncrMult) / base);
    const newAfterIncrTotalSupply = (totalSupply * (newAfterIncrMult) / base);

    // calculate refreshed multiplier when increasing rebase shares.
    function calculateAfterIncrMult(totalRebaseShares: bigint, beforeIncrMult: bigint, afterIncrMult: bigint, mintValue: bigint) {
      // ((RS * afterIncrMult) + mintValue) * beforeIncrMult / (RS * beforeIncrMult) + mintValue)
      return (((totalRebaseShares * afterIncrMult) + (mintValue * base)) * beforeIncrMult) /
                                           ((totalRebaseShares * beforeIncrMult) + (mintValue * base));
    }

    it("sets beforeIncrMult, afterIncrMult and increase time", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      await expect(contract.setNextMultiplier(afterIncrMult, MaxUint256, afterIncrTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(base, afterIncrMult, MaxUint256);
    });

    it("reverts if afterIncrMult is less than beforeIncrMult", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      const invalidMultiplier = base - parseUnits("1", -18); // 1e-18 below base

      await expect(contract.setNextMultiplier(invalidMultiplier, MaxUint256, afterIncrTotalSupply))
        .to.be.revertedWithCustomError(contract, "InvalidRebaseMultiplier")
        .withArgs(invalidMultiplier);
    });

    it("reverts setNextMultiplier if retroactive rebase", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      await expect(contract.setNextMultiplier(afterIncrMult, 0, totalSupply))
        .to.be.revertedWithCustomError(contract, "RetroactiveRebase");
    });

    it("reverts increaseRebaseMultiplier if retroactive rebase", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      const expectedTotalSupply = totalSupply * (base + rebaseRate) / base;
      await expect(contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply))
        .to.be.revertedWithCustomError(contract, "RetroactiveRebase");
    });

    it("allows correcting pending multiplier", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      await contract.setNextMultiplier(afterIncrMult, MaxUint256, afterIncrTotalSupply);
      expect(await contract.totalSupply()).to.equal(totalSupply);

      // correct the pending multiplier
      const effectTime = await getBlockTimestamp() + 10;
      await contract.setNextMultiplier(newAfterIncrMult, effectTime, newAfterIncrTotalSupply);

      // beforeIncrMult should still be active, expect no supply change
      expect(await contract.totalSupply()).to.equal(totalSupply); 
    });

    it("a rebaseRate of zero increases multIncrTime, does not change active multiplier", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      let effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      await expect(contract.increaseRebaseMultiplier(0, afterIncrTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(afterIncrMult, afterIncrMult, effectTime + rebasePeriod);

      expect(await contract.multIncrTime()).to.greaterThan(effectTime);
      expect(await contract.getActiveMultiplier()).to.equal(afterIncrMult);

      // Simulate time passing
      await network.provider.send("evm_increaseTime", [rebasePeriod]);
      await network.provider.send("evm_mine");

      let currentBlockTimestamp = await getBlockTimestamp();
      expect(await contract.multIncrTime()).to.lessThan(currentBlockTimestamp);

      // Ensure active multiplier is the same after the rebase event
      expect(await contract.getActiveMultiplier()).to.equal(afterIncrMult);
    });

    it("reverts if next multiplier is already set", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      const currentBlockTimestamp = await getBlockTimestamp();
      await contract.setNextMultiplier(afterIncrMult, currentBlockTimestamp + 10, afterIncrTotalSupply);
      await expect(contract.increaseRebaseMultiplier(rebaseRate, afterIncrTotalSupply))
        .to.be.revertedWithCustomError(contract, "NextIncreaseAlreadySet");
    });
    
    it("reverts increaseRebaseMultiplier after increasing supply", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const rebaseRate = parseUnits("0.0004");
      const nextMult = (base + rebaseRate) / base;
      const expectedTotalSupply = totalSupply * nextMult / base;

      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      // Increase the supply for race condition.
      await contract.increaseSupply(base);

      await expect(contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply))
        .to.be.revertedWithCustomError(contract, "UnexpectedTotalSupply");

      // Simulate time passing
      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // Check the total supply is same as expected, original + increaseSupply.
      expect(await contract.totalSupply()).to.be.within(afterIncrTotalSupply + base - wei, afterIncrTotalSupply + base);
    });

    it("reverts setNextMultiplier after increasing supply", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const beforeIncrMult = base;
      const rebaseRate = parseUnits("0.001");
      const afterIncrMult = beforeIncrMult * (base + rebaseRate) / base;
      const currentBlockTimestamp = await getBlockTimestamp();
      const multIncrTime = currentBlockTimestamp + rebasePeriod;

      // Calculated the expected total supply.
      const expectedTotalSupply = totalSupply * (base + rebaseRate) / base;

      // Increase the supply for race condition.
      await contract.increaseSupply(base);

      await expect(contract.setNextMultiplier(afterIncrMult, multIncrTime, expectedTotalSupply))
        .to.be.revertedWithCustomError(contract, "UnexpectedTotalSupply");

      // Simulate time passing
      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // Check the total supply is same as expected, original + increaseSupply.
      expect(await contract.totalSupply()).to.be.equal(totalSupply+base);
    });

    it("increase rebase multiplier emits beforeIncrMult afterIncrMult and increase time", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(base, effectTime, totalSupply);
      
      const rebaseMultiplier = await contract.getActiveMultiplier();
      const afterIncrMult = rebaseMultiplier * (base + rebaseRate) / base;
      const expectedTotalSupply = totalSupply * (base + rebaseRate) / base;

      await expect(contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(base, afterIncrMult, effectTime+rebasePeriod);

      // Simulate time passing
      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      expect(await contract.getActiveMultiplier()).to.equal(afterIncrMult);
    });

    it("does not update account balance and supply when next multiplier is set and increase time hasn't passed", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.transfer(addr1.address, amount);

      const effectTime = await getBlockTimestamp() + 10;
      await contract.setRebasePeriod(effectTime);

      const expectedTotalSupply = totalSupply * (base + rebaseRate) / base;
      await contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply);

      expect(await contract.balanceOf(addr1.address)).to.equal(amount); // Still using base multiplier
      expect(await contract.totalSupply()).to.equal(totalSupply);
    });

    it("updates account balance and supply when next multiplier takes effect", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.transfer(addr1.address, amount);

      const effectTime = await getBlockTimestamp() + 10;
      await contract.setRebasePeriod(effectTime);

      const expectedTotalSupply = totalSupply * (base + rebaseRate) / base;
      await contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply);

      // Simulate time passing
      await network.provider.send("evm_increaseTime", [9]);
      await network.provider.send("evm_mine")

      const afterIncrMult = base * (base + rebaseRate) / base;
      const expectedBal = (amount * afterIncrMult) / base;
      expect(await contract.balanceOf(addr1.address)).to.equal(expectedBal);

      const expectedTs = (totalSupply * afterIncrMult) / parseUnits("1");
      expect(await contract.totalSupply()).to.equal(expectedTs);
    });

    it("increases multiplier at maxRebaseRate", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      const effectTime = await getBlockTimestamp() + 10;
      await contract.setRebasePeriod(effectTime);

      const beforeIncrMult = base;
      const afterIncrMult = beforeIncrMult * (base + rebaseRate) / base;

      await contract.setMaxRebaseRate(rebaseRate);

      const expectedTotalSupply = afterIncrMult * totalSupply / base;
      await expect(contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(base, afterIncrMult, effectTime);
    });

    it("reverts when increasing multiplier exceeds maxRebaseRate", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const beforeIncrMult = base;
      const afterIncrMult = parseUnits("1.2");
      let expectedTotalSupply = afterIncrMult * totalSupply / base;
      const rebaseRate = base - beforeIncrMult * base / afterIncrMult;

      await contract.setMaxRebaseRate(rebaseRate);

      const invalidRebaseRate = rebaseRate + parseUnits("1", -18);

      await expect(contract.increaseRebaseMultiplier(invalidRebaseRate, expectedTotalSupply))
        .to.be.revertedWithCustomError(contract, "InvalidRebaseRate")
        .withArgs(invalidRebaseRate);
    });

    it("maxRebaseRate rate cannot exceed base", async () => {
      const { contract } = await loadFixture(deployYBSFixture);

      // Add 1e-18 to just go over the max
      const invalidRebaseRate = base + parseUnits("1", -18);

      await expect(contract.setMaxRebaseRate(invalidRebaseRate))
        .to.be.revertedWithCustomError(contract, "InvalidMaxRebaseRate")
        .withArgs(invalidRebaseRate);
    });

    it("blocked account should not get rebase", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.transfer(addr1.address, amount);
      await contract.blockAccounts([addr1.address]);

      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      // Simulate time passing
      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      expect(await contract.getActiveMultiplier()).to.equal(afterIncrMult);
      expect(await contract.balanceOf(addr1.address)).to.equal(amount);
    });

    it("account can get rebase after unblocked", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      await contract.transfer(addr1.address, amount);
      await contract.blockAccounts([addr1.address]);

      expect(await contract.isAddrBlocked(addr1.address)).to.be.true;

      await contract.unblockAccounts([addr1.address]);
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      const expected = (amount * afterIncrMult) / base;

      expect(await contract.getActiveMultiplier()).to.equal(afterIncrMult);
      expect(await contract.balanceOf(addr1.address)).to.equal(expected);
    });

    it("account in _blocklistForReceiving should still see balance increase after rebase", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      let effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);
      
      await contract.transfer(addr1.address, amount);
      const rebaseShares = await contract.rebaseSharesOf(addr1.address);
      const fixedShares = await contract.fixedSharesOf(addr1.address);

      // validate shares should not have changed
      await contract.blockAccountsFromReceiving([addr1.address]);
      expect(await contract.isAddrBlockedForReceiving(addr1.address)).to.be.true;
      expect(await contract.rebaseSharesOf(addr1.address)).to.equal(rebaseShares);
      expect(await contract.fixedSharesOf(addr1.address)).to.equal(fixedShares);

      // validate balance should not have changed, rounding error is acceptable.
      expect(await contract.balanceOf(addr1.address)).to.within(amount-wei, amount);
      
      effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(newAfterIncrMult, effectTime, newAfterIncrTotalSupply);

      // Validate balance should have increased
      expect(await contract.balanceOf(addr1.address)).to.be.greaterThan(amount);

      const expectedBalAfterIncr = (rebaseShares * newAfterIncrMult) / base;
      expect(await contract.balanceOf(addr1.address)).to.equal(expectedBalAfterIncr);
    });

    it("removing account from _blocklistForReceiving should still see balance increase after rebase", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      let effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);
      
      await contract.transfer(addr1.address, amount);
      const rebaseShares = await contract.rebaseSharesOf(addr1.address);
      const fixedShares = await contract.fixedSharesOf(addr1.address);

      // block, then unblock and validate shares should not have changed
      await contract.blockAccountsFromReceiving([addr1.address]);
      expect(await contract.isAddrBlockedForReceiving(addr1.address)).to.be.true;
      await contract.unblockAccountsFromReceiving([addr1.address]);
      expect(await contract.isAddrBlockedForReceiving(addr1.address)).to.be.false;
      expect(await contract.rebaseSharesOf(addr1.address)).to.equal(rebaseShares);
      expect(await contract.fixedSharesOf(addr1.address)).to.equal(fixedShares);

      effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(newAfterIncrMult, effectTime, newAfterIncrTotalSupply);
      
      // Validate balance should have increased
      expect(await contract.balanceOf(addr1.address)).to.be.greaterThan(amount);

      const expectedBalAfterIncr = (rebaseShares * newAfterIncrMult) / base;
      expect(await contract.balanceOf(addr1.address)).to.equal(expectedBalAfterIncr);
    });

    it ("account has rebase shares", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);
      await contract.transfer(addr1.address, amount);

      const expected = (amount *  base) / afterIncrMult;

      expect(await contract.rebaseSharesOf(addr1.address)).to.equal(expected);
      expect(await contract.totalRebaseShares()).to.equal(totalSupply);
    });

    it ("account has fixed shares", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);
      
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);
      await contract.transfer(addr1.address, amount);
      await contract.blockAccounts([addr1.address]); // convert to fixed shares

      const rebaseShares = (amount *  base) / afterIncrMult;
      const expectedFixedShares = (rebaseShares *  afterIncrMult) / base;

      expect(await contract.fixedSharesOf(addr1.address)).to.equal(expectedFixedShares);
      expect(await contract.totalFixedShares()).to.equal(expectedFixedShares);
    });

    it("reverts when the transfer amount converts to zero shares", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      await expect(contract.transfer(addr1.address, 1))
        .to.be.revertedWithCustomError(contract, "ZeroSharesFromValue");
    });

    it ("reverts when mint amount converts to zero shares", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      const mintValue = parseUnits("1", -18);
      await expect(contract.increaseSupply(mintValue))
        .to.be.revertedWithCustomError(contract, "ZeroSharesFromValue")
        .withArgs(mintValue);
    });

    it ("reverts when burn amount converts to zero shares", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      const burnValue = parseUnits("1", -18);
      await expect(contract.decreaseSupply(burnValue))
        .to.be.revertedWithCustomError(contract, "ZeroSharesFromValue")
        .withArgs(burnValue);
    });

    it ("reverts when converting fixed shares to zero rebase shares", async () => {
      const { contract, addr1 } = await loadFixture(deployYBSFixture);

      const amount = parseUnits("1", -18);
      await contract.transfer(addr1.address, amount);
      await contract.blockAccounts([addr1.address]); // convert to fixed shares
      
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime, afterIncrTotalSupply);

      // convert back to rebase shares
      await expect(contract.unblockAccounts([addr1.address]))
        .to.be.revertedWithCustomError(contract, "ZeroSharesFromValue")
        .withArgs(amount);
    });

    it("set rebase multiplier and mint before multiplier increase is in progress", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const mintValue = parseUnits("10");
      const beforeIncrMult = parseUnits("1");
      const afterIncrMult = parseUnits("2");
      const expectedActiveMulAfterRebase = calculateAfterIncrMult(totalSupply, beforeIncrMult, afterIncrMult, mintValue);

      let currentBlockTimestamp = await getBlockTimestamp();
      let multIncrTime = currentBlockTimestamp + rebasePeriod;

      let expectedTotalSupply = 2n * totalSupply; // We are setting the multiplier to 2.
      // sets the rebaseMultiplier.
      await expect(contract.setNextMultiplier(afterIncrMult, multIncrTime, expectedTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(beforeIncrMult, afterIncrMult, multIncrTime);

      const currTotalSupply = await contract.totalSupply();
      await expect(contract.increaseSupply(mintValue))
        .to.emit(contract, "RebaseMultipliersSet").withArgs(beforeIncrMult, expectedActiveMulAfterRebase, multIncrTime);
      // confirm the increaseSupply was success
      expect(await contract.totalSupply()).to.equal(currTotalSupply + mintValue);

      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // Since multiplier was increased by 1, we expect additional totalSupply.
      const expectedTsAfterRebaseAndMint = currTotalSupply + mintValue + totalSupply;
      // totalSupply can be off by 1 due to rounding.
      expect(await contract.totalSupply()).to.within(expectedTsAfterRebaseAndMint-base, expectedTsAfterRebaseAndMint);

      // Expected multiplier has changed.
      const currentActiveMultipler = await contract.getActiveMultiplier()
      expect(currentActiveMultipler).to.equal(expectedActiveMulAfterRebase);
      expect(currentActiveMultipler).to.lessThan(afterIncrMult);
    });

    it("increase rebase multiplier and mint before multiplier increase is in progress", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const mintValue = parseUnits("10");
      const afterIncrMult = parseUnits("2")
      const expectedActiveMulAfterRebase = calculateAfterIncrMult(totalSupply, base, afterIncrMult, mintValue);

      let expectedTotalSupply = 2n * totalSupply;
      let currentBlockTimestamp = await getBlockTimestamp();
      const multIncrTime = currentBlockTimestamp + rebasePeriod;

      const effectTime = await getBlockTimestamp() + rebasePeriod;
      await contract.setRebasePeriod(effectTime);

      // increase the multiplier from 1 to 2.
      await expect(contract.increaseRebaseMultiplier(base, expectedTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(base, afterIncrMult, multIncrTime);

      let currTotalSupply = await contract.totalSupply();
      await expect(contract.increaseSupply(mintValue))
        .to.emit(contract, "RebaseMultipliersSet").withArgs(base, expectedActiveMulAfterRebase, multIncrTime);
      // confirm the increaseSupply was success
      expect(await contract.totalSupply()).to.equal(currTotalSupply + mintValue);

      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // Since multiplier was increased by 1, we expect additional totalSupply.
      const expectedTsAfterRebaseAndMint = currTotalSupply + mintValue + totalSupply;
      // totalSupply can be off by 1 due to rounding.
      expect(await contract.totalSupply()).to.within(expectedTsAfterRebaseAndMint-base, expectedTsAfterRebaseAndMint);

      // Expected multiplier has changed.
      const currentActiveMultipler = await contract.getActiveMultiplier()
      expect(currentActiveMultipler).to.equal(expectedActiveMulAfterRebase);
      expect(currentActiveMultipler).to.lessThan(afterIncrMult);
    });

    it("change afterIncrMult of contract and unblock an account before the effect time", async () => {
      const { contract, addr1, addr2} = await loadFixture(deployYBSFixture);

      // Values of block account to be transferred after beforeIncrMult is set.
      const blockAccountValue1 = parseUnits("10");
      const blockAccountValue2 = parseUnits("40");
      const beforeIncrMult = parseUnits("2");
      const afterIncrMult = parseUnits("3");
      const totalRebaseShares = parseUnits("123");

      const totalRebaseSharesOfBlockedAccounts = (blockAccountValue1 + blockAccountValue2) / (beforeIncrMult ) * base;
      const totalRebaseSharesWhenRebaseIsRequested = (totalRebaseShares -  totalRebaseSharesOfBlockedAccounts);
      const expectedActiveMulAfterRebase = calculateAfterIncrMult(totalRebaseSharesWhenRebaseIsRequested, beforeIncrMult, afterIncrMult, blockAccountValue1);

      let effectTime = await getBlockTimestamp() + 1;

      // set next rebase multiplier to beforeIncrMult value.
      let expectedTotalSupply = totalRebaseShares * beforeIncrMult / base;
      await expect(contract.setNextMultiplier(beforeIncrMult, effectTime, expectedTotalSupply))
      .to.emit(contract, "RebaseMultipliersSet")
      .withArgs(base, beforeIncrMult, effectTime);
      // setup: fund two accounts and block both of them.
      await contract.transfer(addr2.address, blockAccountValue2);
      await contract.transfer(addr1.address, blockAccountValue1);
      await contract.blockAccounts([addr1.address, addr2.address]);

      // increasing multiplier by 1 (50% increase)
      const rebaseRate = parseUnits("0.5")
      const multIncrTime = effectTime + rebasePeriod
      expectedTotalSupply = totalRebaseShares * afterIncrMult / base;
      await expect(contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(beforeIncrMult, afterIncrMult, multIncrTime);

      // still expecting current multiplier to be 2
      expect(await contract.getActiveMultiplier()).to.equal(beforeIncrMult);

      // unblock the account so that rebase shares increases
      await expect(contract.unblockAccounts([addr1.address]))
        .to.emit(contract, "AccountUnblocked").withArgs(addr1.address)
        .to.emit(contract, "RebaseMultipliersSet").withArgs(beforeIncrMult, expectedActiveMulAfterRebase, multIncrTime);
      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // Expected multiplier has changed.
      const currentActiveMultipler = await contract.getActiveMultiplier()
      expect(currentActiveMultipler).to.equal(expectedActiveMulAfterRebase);
      expect(currentActiveMultipler).to.lessThan(afterIncrMult);
    });

    it("increase rebase multiplier and burn before multiplier increase is in progress", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const burnValue = parseUnits("10");
      const afterIncrMult = parseUnits("2")
      const expectedActiveMulAfterRebase = calculateAfterIncrMult(totalSupply, base, afterIncrMult, -burnValue);

      let expectedTotalSupply = 2n * totalSupply;
      let currentBlockTimestamp = await getBlockTimestamp();
      const multIncrTime = currentBlockTimestamp + rebasePeriod;

      const effectTime = await getBlockTimestamp() + rebasePeriod;
      await contract.setRebasePeriod(effectTime);

      // increase the multiplier from 1 to 2.
      await expect(contract.increaseRebaseMultiplier(base, expectedTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(base, afterIncrMult, multIncrTime);

      let currTotalSupply = await contract.totalSupply();
      await expect(contract.decreaseSupply(burnValue))
        .to.emit(contract, "RebaseMultipliersSet").withArgs(base, expectedActiveMulAfterRebase, multIncrTime);
      // confirm the increaseSupply was success
      expect(await contract.totalSupply()).to.equal(currTotalSupply - burnValue);

      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // Since multiplier was increased by 1, we expect additional totalSupply.
      const expectedTsAfterRebaseAndBurn = currTotalSupply - burnValue + totalSupply;
      // totalSupply can be off by 1 due to rounding.
      expect(await contract.totalSupply()).to.within(expectedTsAfterRebaseAndBurn-base, expectedTsAfterRebaseAndBurn);

      const currentActiveMultipler = await contract.getActiveMultiplier()
      expect(currentActiveMultipler).to.equal(expectedActiveMulAfterRebase);
      expect(currentActiveMultipler).to.greaterThan(afterIncrMult);
    });

    it("change afterIncrMult of contract and block an account before the effect time", async () => {
      const { contract, addr1} = await loadFixture(deployYBSFixture);

      // Values of block account to be transferred after beforeIncrMult is set.
      const blockAccountValue = parseUnits("10");
      const beforeIncrMult = parseUnits("2");
      const afterIncrMult = parseUnits("3");
      const totalRebaseShares = parseUnits("123");
      const expectedActiveMulAfterRebase = calculateAfterIncrMult(totalRebaseShares, beforeIncrMult, afterIncrMult, -blockAccountValue);

      let effectTime = await getBlockTimestamp() + 1;

      // sets next rebase multiplier to beforeIncrMult value.
      let expectedTotalSupply = totalRebaseShares * beforeIncrMult / base;
      await expect(contract.setNextMultiplier(beforeIncrMult, effectTime, expectedTotalSupply))
      .to.emit(contract, "RebaseMultipliersSet")
      .withArgs(base, beforeIncrMult, effectTime);
      // setup: fund account.
      await contract.transfer(addr1.address, blockAccountValue);

      // increasing multiplier by 1 (50% increase)
      const rebaseRate = parseUnits("0.5");
      const multIncrTime = effectTime + rebasePeriod;
      expectedTotalSupply = totalRebaseShares * afterIncrMult / base;
      await expect(contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply))
        .to.emit(contract, "RebaseMultipliersSet")
        .withArgs(beforeIncrMult, afterIncrMult, multIncrTime);

      // block the account so that rebase shares decreases
      await expect(contract.blockAccounts([addr1.address]))
        .to.emit(contract, "AccountBlocked").withArgs(addr1.address)
        .to.emit(contract, "RebaseMultipliersSet").withArgs(beforeIncrMult, expectedActiveMulAfterRebase, multIncrTime);

      // still expecting current multiplier to be 2
      expect(await contract.getActiveMultiplier()).to.equal(beforeIncrMult);

      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // Expected multiplier has changed.
      const currentActiveMultipler = await contract.getActiveMultiplier();
      expect(currentActiveMultipler).to.equal(expectedActiveMulAfterRebase);
      expect(currentActiveMultipler).to.greaterThan(afterIncrMult);
    });

    it("afterIncrMult should not change when adding/removing to/from _blocklistForReceiving", async () => {
      const { contract, addr1} = await loadFixture(deployYBSFixture);

      // setup - fund the account to be blocked.
      await contract.transfer(addr1.address, amount);

      // set future multiplier then block account
      const effectTime = await getBlockTimestamp() + 1;
      await contract.setNextMultiplier(afterIncrMult, effectTime+rebasePeriod, afterIncrTotalSupply);
      expect (await contract.getActiveMultiplier()).to.equal(base); // afterIncrMult is not active yet
      contract.blockAccountsFromReceiving([addr1.address]);

      // verify the blocking did not change the future multiplier
      expect(await contract.afterIncrMult()).to.equal(afterIncrMult);

      // unblock the account and verify the future multiplier is still the same
      contract.unblockAccountsFromReceiving([addr1.address]);
      expect(await contract.afterIncrMult()).to.equal(afterIncrMult);
    });

    it("add and remove addresses from block lists over time with rebases", async () => {
      const { contract } = await loadFixture(deployYBSFixture);
      const [_, addr1, addr2, addr3, addr4, addr5, addr6] = await ethers.getSigners();
      const addresses = [addr1.address, addr2.address, addr3.address, addr4.address, addr5.address, addr6.address];
      let unblockedAddrs = addresses.slice(0, 2)
      let blockedAddrs = addresses.slice(2, 4)
      let blockedForReceivingAddrs = addresses.slice(4, 6)
      let initTotalRebaseShares = await contract.totalRebaseShares();
      const initBal = parseUnits("10");
      const expectedRebaseSharesAfterBlock = initTotalRebaseShares - (initBal * BigInt(2));

      // setup - fund addresses prior to blocking & rebasing
      for (const address of addresses) {
        await contract.transfer(address, initBal);
      }

      // set up so that the first rebase is in the future, then reset the rebase period
      const effectTime = await getBlockTimestamp() + rebasePeriod;
      await contract.setRebasePeriod(effectTime);

      // Rebase 1
      let expectedTotalSupply = totalSupply * (base + rebaseRate) / base;
      await contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply);

      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      let expectedBal = initBal * (base + rebaseRate) / base;
      for (const address of addresses) {
        expectBalancesOfAddr(contract, address, expectedBal, initBal, BigInt(0));
      }

      let currentTotalSupply = await contract.totalSupply();

      // add two to each block list, leave two unblocked
      await contract.blockAccounts(blockedAddrs);
      await contract.blockAccountsFromReceiving(blockedForReceivingAddrs);

      // Ensure total supply hasn't changed, but there now should be fixed shares
      const blockedBal = expectedBal;
      expect(await contract.totalSupply()).to.equal(currentTotalSupply);
      expect(await contract.totalFixedShares()).to.equal(blockedBal * BigInt(2));
      expect(await contract.totalRebaseShares()).to.equal(expectedRebaseSharesAfterBlock);

      // Rebase 2
      await contract.setRebasePeriod(rebasePeriod); // reset rebase period 

      let fixedShares = await contract.totalFixedShares();
      let rebaseShares = await contract.totalRebaseShares();
      let nextMult = (await contract.getActiveMultiplier()) * (base + rebaseRate) / base; 
      expectedTotalSupply = (rebaseShares * nextMult / base) + fixedShares;
      expect(await contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply)).not.to.be.reverted;

      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // validate balances
      expect(await contract.totalSupply()).to.equal(expectedTotalSupply);
      expect(await contract.totalFixedShares()).to.equal(blockedBal * BigInt(2));
      expect(await contract.totalRebaseShares()).to.equal(expectedRebaseSharesAfterBlock);

      // unblocked & blockedForReceiving should see increase
      expectedBal = (initBal * nextMult / base);
      for (const address of [unblockedAddrs, blockedForReceivingAddrs].flat()) {
        expectBalancesOfAddr(contract, address, expectedBal, initBal, BigInt(0));
      }

      // blocked addrs should see no change
      for (const address of blockedAddrs) {
        expectBalancesOfAddr(contract, address, blockedBal, BigInt(0), blockedBal);
      }

      // remove one address from each block list
      await contract.unblockAccounts([addresses.at(3)]);
      await contract.unblockAccountsFromReceiving([addresses.at(5)]);

      // only the unblockAccount call should increase rebase shares
      // Expect to be off by of 1e-18 since converting to rebase shares will round to zero when dividing.
      expect(await contract.totalSupply()).to.within(expectedTotalSupply-wei, expectedTotalSupply);
      const unblockedShares = (blockedBal * base) / nextMult;
      const expectedRebaseShares = expectedRebaseSharesAfterBlock + unblockedShares;
      expect(await contract.totalRebaseShares()).to.equal(expectedRebaseShares);
      expect(await contract.totalFixedShares()).to.equal(blockedBal);

      // Rebase 3
      fixedShares = await contract.totalFixedShares();
      rebaseShares = await contract.totalRebaseShares();
      nextMult = (await contract.getActiveMultiplier()) * (base + rebaseRate) / base; 
      expectedTotalSupply = (rebaseShares * nextMult / base) + fixedShares;
      expect(await contract.increaseRebaseMultiplier(rebaseRate, expectedTotalSupply)).not.to.be.reverted;

      await network.provider.send("evm_increaseTime", [rebasePeriod-1]);
      await network.provider.send("evm_mine");

      // validate balances
      expect(await contract.totalSupply()).to.equal(expectedTotalSupply);
      expect(await contract.totalRebaseShares()).to.equal(expectedRebaseShares); // should be same as before
      expect(await contract.totalFixedShares()).to.equal(blockedBal); // should be same as before

      // unblocked & blockedForReceiving should see increase
      expectedBal = (initBal * nextMult / base);
      for (const address of [unblockedAddrs, blockedForReceivingAddrs].flat()) {
        expectBalancesOfAddr(contract, address, expectedBal, initBal, BigInt(0));
      }

      // blocked addr should see no change
      expectBalancesOfAddr(contract, addresses.at(2), blockedBal, BigInt(0), blockedBal);

      // recently unblocked addr should see increase
      let expectedUnblockedBal = (unblockedShares * nextMult / base);
      await expectBalancesOfAddr(contract, addresses.at(3), expectedUnblockedBal, unblockedShares, BigInt(0));
    });
  });

  async function expectBalancesOfAddr(contract: any, address: any, balance: bigint, rebaseShares: bigint, fixedShares: bigint) {
    expect(await contract.balanceOf(address)).to.equal(balance);
    expect(await contract.rebaseSharesOf(address)).to.equal(rebaseShares);
    expect(await contract.fixedSharesOf(address)).to.equal(fixedShares);
  }
});
