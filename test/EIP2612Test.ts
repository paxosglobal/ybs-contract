import { expect } from "chai";
import assert = require('assert');
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

import { deployYBSFixture } from "./helpers/fixtures";
import { signPermit, PERMIT_TYPEHASH, MAX_UINT256 } from "./helpers/signature";
import { getBlockTimestamp } from "./helpers/commonutil";

const web3 = require("web3");

describe("EIP2612", function () {

  let contract: any;
  let admin: any;
  let addr1: any;
  let addr2: any;
  let spender: any;
  let domainSeparator: any;
  let sender: any;
  let recipient: any;

  const deadline = MAX_UINT256;
  const senderBalance = 10;
  const transactionValue = 10;
  const permitAllowance = 10;
  const nonce = 0;

  beforeEach(async () => {
    ({ contract, admin, addr1, addr2 } = await loadFixture(deployYBSFixture));
    domainSeparator = await contract.DOMAIN_SEPARATOR();

    spender = addr1;
    // We need private key for sender, hence generate a wallet.
    sender = ethers.Wallet.createRandom();
    recipient = addr2;

    // fund sender
    await contract.transfer(sender.address, senderBalance);

    contract = contract.connect(spender);
  });

  it("has the expected type hash for permit", async () => {
    expect(await contract.PERMIT_TYPEHASH()).to.equal(
      PERMIT_TYPEHASH
    );
  });

  it("executes a transferFrom with a valid authorization", async () => {
    // Permit spender
    const { v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce,
      MAX_UINT256,
      domainSeparator,
      sender.privateKey
    );

    // Spender executes the permit transaction
    let result = await contract.permit(sender.address, spender.address, permitAllowance, deadline, v, r, s);
    expect(await contract.nonces(sender.address)).to.equal(1);
    expect(await contract.balanceOf(recipient.address)).to.equal(0);

    result = await contract.transferFrom(sender.address, recipient.address, transactionValue);
    expect(await contract.balanceOf(sender.address)).to.equal(
      senderBalance - transactionValue);
    expect(await contract.balanceOf(recipient.address)).to.equal(
      transactionValue);
  });

  it("executes a BATCH transferFrom with a valid authorization", async () => {
    const batch = 5;
    let senders = [];
    let recipients = [];
    let amounts = [];

    // generate the senders and recipients
    for (let i = 0; i < batch; i++) {
      senders.push(ethers.Wallet.createRandom());
      recipients.push(ethers.Wallet.createRandom());
    }

    for (let i = 0; i < batch; i++) {
      sender = senders[i]
      // Fund sender
      await contract.connect(admin).transfer(sender.address, transactionValue);
      amounts.push(transactionValue);

      const { v, r, s } = signPermit(
        sender.address,
        spender.address,
        transactionValue * (batch + 1),
        nonce,
        MAX_UINT256,
        domainSeparator,
        sender.privateKey
      );

      // Spender executes the permit transaction
      await contract.permit(sender.address, spender.address, transactionValue * (batch + 1), deadline, v, r, s);
    }
    await contract.transferFromBatch(senders.map(sender => sender.address), recipients.map(recv => recv.address), amounts);

    for (let i = 0; i < batch; i++) {
      expect(await contract.balanceOf(recipients[i].address)).to.equal(
        transactionValue);
    }
  });


  it('insufficient funds for transferFromBatch', async function () {
    let batch = 10;
    let amount = 100;
    let froms = Array(batch).fill(addr1.address);
    let tos = Array(batch).fill(addr2.address);
    let amounts = Array(batch).fill(amount);
    await expect(contract.transferFromBatch(froms, tos, amounts))
      .to.revertedWithCustomError(contract, "ERC20InsufficientAllowance");
  });

  it('revert when sender is blocked for transferFromBatch', async function () {
    let batch = 4;
    let amount = 100;
    let froms = Array(batch).fill(sender.address);
    let tos = Array(batch).fill(addr2.address);
    let amounts = Array(batch).fill(amount);

    const { v, r, s } = signPermit(
      sender.address,
      addr1.address,
      amount * (batch + 1),
      nonce,
      MAX_UINT256,
      domainSeparator,
      sender.privateKey
    );

    // Spender(addr1) executes the permit transaction
    await contract.permit(sender.address, addr1.address, amount * (batch + 1), deadline, v, r, s);

    await contract.connect(admin).blockAccounts([froms[0]]);
    await expect(contract.connect(addr1).transferFromBatch(froms, tos, amounts))
      .to.revertedWithCustomError(contract, "BlockedAccountSender");
  });

  it('blocked `to` transferFromBatch', async function () {
    let batch = 4;
    let amount = 100;
    let froms = Array(batch).fill(sender.address);
    let tos = Array(batch).fill(addr2.address);
    let amounts = Array(batch).fill(amount);

    const { v, r, s } = signPermit(
      sender.address,
      addr1.address,
      amount * (batch + 1),
      nonce,
      MAX_UINT256,
      domainSeparator,
      sender.privateKey
    );

    // Spender(addr1) executes the permit transaction
    await contract.permit(sender.address, addr1.address, amount * (batch + 1), deadline, v, r, s);

    await contract.connect(admin).blockAccounts([tos[0]]);
    await expect(contract.connect(addr1).transferFromBatch(froms, tos, amounts))
      .to.revertedWithCustomError(contract, "BlockedAccountReceiver");
  });

  it('blocked spender transferFromBatch', async function () {
    let batch = 4;
    let amount = 100;
    let froms = Array(batch).fill(addr1.address);
    let tos = Array(batch).fill(recipient.address);
    let amounts = Array(batch).fill(amount);
    await contract.connect(admin).blockAccounts([spender]);

    await expect(contract.transferFromBatch(froms, tos, amounts))
      .to.revertedWithCustomError(contract, "BlockedAccountSpender");
  });


  it('reverts in case of bad parameters', async function () {
    let batch = 10;
    let amount = 10;
    let froms = Array(batch).fill(admin.address);
    let tos = Array(batch).fill(recipient.address);
    let amounts = Array(batch).fill(amount);

    // All test case validation is done in single test to avoid setup overhead.
    let allParams = [froms, tos, amounts];
    assert(allParams.length == 3, "incomplete check for the number of arguments to transfersFromBatch");
    for (let i = 0; i < allParams.length; i++) {
      const currentParam = allParams[i];
      let val = currentParam.pop();
      await expect(contract.transferFromBatch(froms, tos, amounts))
        .to.revertedWithCustomError(contract, "ArgumentLengthMismatch");
      currentParam.push(val);
    }
  });

  it("revert when deadline is expired", async () => {
    let deadline = await getBlockTimestamp() - 1;

    const { v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce,
      MAX_UINT256,
      domainSeparator,
      sender.privateKey
    );

    await expect(contract.connect(spender).permit(sender.address, spender, permitAllowance, deadline, v, r, s))
      .to.be.revertedWithCustomError(contract, "PermitExpired");
  });

  it("revert when signature is invalid", async () => {
    // incorrect user signs the permit
    const currentBlockTimestamp = await getBlockTimestamp();

    let randomWallet = ethers.Wallet.createRandom();
    const { v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce,
      currentBlockTimestamp,
      domainSeparator,
      randomWallet.privateKey
    );

    await expect(contract.permit(sender.address, spender, permitAllowance + 10e6, deadline, v, r, s)).
      to.be.revertedWithCustomError(contract, "InvalidSignature");
  });

  it("revert when token owner address is blocked", async () => {
    // admin blocks sender for the test.
    await contract.connect(admin).blockAccounts([sender.address])

    const { v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce,
      MAX_UINT256,
      domainSeparator,
      sender.privateKey
    );

    await expect(contract.permit(sender.address, spender, permitAllowance, deadline, v, r, s))
      .to.be.revertedWithCustomError(contract, "BlockedAccountOwner");
  });

  it("multiple permit with incremental nonce should be success", async () => {
    let { v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce,
      deadline,
      domainSeparator,
      sender.privateKey
    );

    await contract.permit(sender.address, spender, permitAllowance, deadline, v, r, s);
    ({ v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce + 1,
      deadline,
      domainSeparator,
      sender.privateKey
    ));

    await contract.permit(sender.address, spender, permitAllowance, deadline, v, r, s);
  });


  it("revert when multiple permit with non-incremental nonce", async () => {
    const { v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce,
      deadline,
      domainSeparator,
      sender.privateKey
    );
    await contract.permit(sender.address, spender, permitAllowance, deadline, v, r, s);

    await expect(contract.permit(sender.address, spender, permitAllowance, deadline, v, r, s))
      .to.be.revertedWithCustomError(contract, "InvalidSignature");
  });


  it("revert when contract is paused", async () => {
    await expect(contract.connect(admin).pause()).to.emit(contract, "Paused");

    const { v, r, s } = signPermit(
      sender.address,
      spender.address,
      permitAllowance,
      nonce,
      deadline,
      domainSeparator,
      sender.privateKey
    );

    await expect(contract.permit(sender.address, spender, permitAllowance, deadline, v, r, s))
      .to.be.revertedWith(/.*Pausable: paused.*/);

    // Unpause
    await expect(contract.connect(admin).unpause()).to.emit(contract, "Unpaused");
    await contract.permit(sender.address, spender, permitAllowance, deadline, v, r, s);
  });

  describe("ECrecover test cases", () => {
    it("ECrecover, invalid v", async () => {
      const { r, s } = signPermit(
        sender.address,
        spender.address,
        permitAllowance,
        nonce,
        deadline,
        domainSeparator,
        sender.privateKey
      );

      await expect(contract.permit(sender.address, spender, permitAllowance, deadline, 35, r, s))
        .to.be.revertedWithCustomError(contract, "InvalidValueV");
    });

    it("ECrecover, invalid s", async () => {
      const { v, r} = signPermit(
        sender.address,
        spender.address,
        permitAllowance,
        nonce,
        deadline,
        domainSeparator,
        sender.privateKey
      );

      await expect(contract.permit(sender.address, spender, permitAllowance, deadline, v, r, "0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A1"))
        .to.be.revertedWithCustomError(contract, "InvalidValueS");
    });
  });
});
