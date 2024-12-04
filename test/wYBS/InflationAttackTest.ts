import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits } from "ethers";

import { deployWrappedYBSFixture } from "../helpers/fixtures";
import { roles } from "../helpers/constants";
import { getBlockTimestamp } from "../helpers/commonutil";

describe("wYBS Inflation Prevention", function () {
  const amount = 10

  let contract: any;
  let ybsContract: any;
  let admin: any;
  let initialSupply: any;

  beforeEach(async () => {
    ({ contract, ybsContract, admin} = await loadFixture(deployWrappedYBSFixture));
    
    ybsContract.increaseSupply(amount);
    initialSupply = await ybsContract.totalSupply();

    ybsContract.grantRole(roles.WRAPPED_YBS_ROLE, contract);
  });

  describe("Direct transfers are reverted", function () {
    it("revert when transfer to wYBS when sender is not wYBS", async function () {
        await expect(ybsContract.transfer(contract, amount)).to.be.revertedWithCustomError(ybsContract, "WYBSTransferNotAllowed");
    });


    it("revert when redeeming to wYBS address", async function () {
        await expect(contract.redeem(amount, contract, admin.address)).to.be.revertedWithCustomError(ybsContract, "WYBSTransferNotAllowed");
    });
  });
});
