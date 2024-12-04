import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits } from "ethers";

import { deployWrappedYBSFixture } from "../helpers/fixtures";
import { getBlockTimestamp } from "../helpers/commonutil";

describe("wYBS ERC4626", function () {
  const initialAmount = parseUnits("10.0")
  const base = parseUnits("1.0")
  const wei = parseUnits("0.000000000000000002");

  let contract: any;
  let ybsContract: any;
  let addr1: any;
  let initialSupply: any;

  beforeEach(async () => {
    ({ contract, ybsContract, addr1} = await loadFixture(deployWrappedYBSFixture));
    
    ybsContract.increaseSupply(initialAmount);
    await ybsContract.approve(await contract.getAddress(), initialAmount);

    initialSupply = await ybsContract.totalSupply();
  });

  describe("ERC4626", function () {
    it("deposit and redeem without YBS rebase", async function () {
      await contract.deposit(initialAmount, addr1.address)
      expect(await contract.balanceOf(addr1.address)).to.be.equal(initialAmount);

      await contract.connect(addr1).withdraw(initialAmount, addr1.address, addr1.address)
      expect(await ybsContract.balanceOf(addr1.address)).to.be.equal(initialAmount);
    });

    it("share amount doesn't increase with rebase", async function () {
      await contract.deposit(initialAmount, addr1.address)
      expect(await contract.balanceOf(addr1.address)).to.be.equal(initialAmount);
      await ybsContract.setMaxRebaseRate(parseUnits("1"));

      let currentBlockTimestamp = await getBlockTimestamp();
      const afterIncrMult = parseUnits("1.5");
      const effectTime = currentBlockTimestamp + 1;
      const expectedTotalSupply = initialSupply * afterIncrMult / base
      const accountAssets = (initialAmount * afterIncrMult) / base
      
      await ybsContract.setNextMultiplier(afterIncrMult, effectTime, expectedTotalSupply)

      expect(await contract.balanceOf(addr1.address)).to.be.equal(initialAmount);
      expect(await contract.previewRedeem(initialAmount)).to.within(accountAssets - wei, accountAssets);
    });

    it("redeem after rebase", async function () {
      await contract.deposit(initialAmount, addr1.address)
      expect(await contract.balanceOf(addr1.address)).to.be.equal(initialAmount);
      await ybsContract.setMaxRebaseRate(parseUnits("1"));

      let currentBlockTimestamp = await getBlockTimestamp();
      const afterIncrMult = parseUnits("1.5");
      const effectTime = currentBlockTimestamp + 1;
      const expectedTotalSupply = initialSupply * afterIncrMult / base
      const accountAssets = (initialAmount * afterIncrMult) / base
      
      await ybsContract.setNextMultiplier(afterIncrMult, effectTime, expectedTotalSupply)
      
      await contract.connect(addr1).redeem(initialAmount, addr1.address, addr1.address)
      expect(await ybsContract.balanceOf(addr1.address)).to.within(accountAssets - wei, accountAssets);
    });
  });
});
