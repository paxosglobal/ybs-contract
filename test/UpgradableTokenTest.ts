import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract, parseUnits } from "ethers";

import { NAME, SYMBOL, DECIMALS, roles } from "./helpers/constants";
import { getBlockTimestamp } from "./helpers/commonutil";
import { isStorageLayoutModified } from "./helpers/storageLayout";

describe("YBS Upgradable Token", function () {
    const totalSupply = parseUnits("30");
    const amount = parseUnits("10");
    const afterRebaseAmount = parseUnits("15");
    const maxRebaseRate = parseUnits("1");
    const rebasePeriod = 10;
    const afterIncrMult = parseUnits("1.5");
    const base = parseUnits("1");

    it("upgrades to new version w/o conflicts", async function () {
        const [
            admin,
            supplyController,
            pauser,
            assetProtector,
            rebaserAdmin,
            rebaser,
            addr1, 
            addr2, 
            addr3,
        ] = await ethers.getSigners();
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
        
        const YBSV1 = await ethers.getContractFactory("YBSV1");
        const contract = await upgrades.deployProxy(YBSV1, initializerArgs, {
            initializer: "initialize",
        });

        // Set state
        await (contract.connect(supplyController) as Contract).increaseSupply(totalSupply);
        await (contract.connect(supplyController) as Contract).transfer(addr1.address, amount);
        await (contract.connect(supplyController) as Contract).transfer(addr2.address, amount);
        await (contract.connect(supplyController) as Contract).transfer(addr3.address, amount);
        await (contract.connect(addr1) as Contract).approve(admin.address, amount);
        await (contract.connect(assetProtector) as Contract).blockAccounts([addr2.address]);
        await (contract.connect(assetProtector) as Contract).blockAccountsFromReceiving([addr3.address]);
        await (contract.connect(rebaserAdmin) as Contract).setRebasePeriod(rebasePeriod);
        await (contract.connect(rebaserAdmin) as Contract).setMaxRebaseRate(maxRebaseRate);

        const effectTime = await getBlockTimestamp() + 1;
        const afterIncrTotalSupply = ((totalSupply - amount) * (afterIncrMult) / base) + amount; // account for fixed shares from blocked addr2
        await (contract.connect(rebaserAdmin) as Contract).setRebaseMultipliers(base, afterIncrMult, effectTime, afterIncrTotalSupply);

        // Upgrade
        const YBSV1_1 = await ethers.deployContract("YBSV1_1");
        await expect(contract.upgradeTo(YBSV1_1)).to.not.be.reverted;

        // Check state
        expect(await contract.owner()).to.be.equal(admin.address);
        expect(await contract.hasRole(roles.SUPPLY_CONTROLLER_ROLE, supplyController.address)).to.be.true;
        expect(await contract.hasRole(roles.PAUSE_ROLE, pauser.address)).to.be.true;
        expect(await contract.hasRole(roles.ASSET_PROTECTION_ROLE, assetProtector.address)).to.be.true;
        expect(await contract.hasRole(roles.REBASE_ADMIN_ROLE, rebaserAdmin.address)).to.be.true;
        expect(await contract.hasRole(roles.REBASE_ROLE, rebaser.address)).to.be.true;
        expect(await contract.totalSupply()).to.be.equal(afterIncrTotalSupply);
        expect(await contract.balanceOf(addr1.address)).to.be.equal(afterRebaseAmount);
        expect(await contract.balanceOf(addr2.address)).to.be.equal(amount);
        expect(await contract.balanceOf(addr3.address)).to.be.equal(afterRebaseAmount);
        expect(await contract.allowance(addr1.address, admin.address)).to.be.equal(amount);
        expect(await contract.isAddrBlocked(addr2.address)).to.be.true;
        expect(await contract.isAddrBlockedForReceiving(addr3.address)).to.be.true;
        expect(await contract.rebasePeriod()).to.be.equal(rebasePeriod);
        expect(await contract.maxRebaseRate()).to.be.equal(maxRebaseRate);
        expect(await contract.beforeIncrMult()).to.be.equal(base);
        expect(await contract.afterIncrMult()).to.be.equal(afterIncrMult);
        expect(await contract.multIncrTime()).to.be.equal(effectTime);
  });

  it('has the same storage layout', async function () {
    const oldFullQualifiedName = "contracts/archive/YBSV1.sol:YBSV1";
    const newFullQualifiedName = "contracts/YBSV1_1.sol:YBSV1_1";
    expect(await isStorageLayoutModified(oldFullQualifiedName, newFullQualifiedName)).to.be.false;
  });
});
