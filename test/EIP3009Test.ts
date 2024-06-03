import { expect } from "chai";
import assert = require('assert');
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { deployYBSFixture } from "./helpers/fixtures";
import { getBlockTimestamp } from "./helpers/commonutil";

import {
  signTransferAuthorization, signReceiveAuthorization, signCancelAuthorization,
  TRANSFER_WITH_AUTHORIZATION_TYPEHASH, RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
  CANCEL_AUTHORIZATION_TYPEHASH, MAX_UINT256
} from "./helpers/signature";


const web3 = require("web3");

describe("EIP3009", function () {

  let contract: any;
  let admin: any;
  let addr1: any;
  let addr2: any;
  let spender: any;
  let sender: any;
  let recipient: any;
  let domainSeparator: any;
  let nonce = 0;

  const senderBalance = 10;
  const transactionValue = 10;
  

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
    nonce = web3.utils.randomHex(32);
  });

  it("validate type hashes", async () => {
    expect(await contract.TRANSFER_WITH_AUTHORIZATION_TYPEHASH()).to.equal(
      TRANSFER_WITH_AUTHORIZATION_TYPEHASH
    );

    expect(await contract.RECEIVE_WITH_AUTHORIZATION_TYPEHASH()).to.equal(
      RECEIVE_WITH_AUTHORIZATION_TYPEHASH
    );

    expect(await contract.CANCEL_AUTHORIZATION_TYPEHASH()).to.equal(
      CANCEL_AUTHORIZATION_TYPEHASH
    );
  });

  describe("transferWithAuthorization", () => {
    it("executes a transferWithAuthorization with a valid authorization", async () => {
      const from = sender.address;
      const to = recipient.address;
      const validAfter = 0;
      const validBefore = MAX_UINT256;

      // Sender signs the authorization
      const { v, r, s } = signTransferAuthorization(
        from,
        to,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // check initial balance
      expect((await contract.balanceOf(from))).to.equal(senderBalance);
      expect((await contract.balanceOf(to))).to.equal(0);
      expect(await contract.authorizationState(from, nonce)).to.be.false;

      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        from,
        to,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s
      )).to.emit(contract, "AuthorizationUsed").withArgs(from, nonce).
        to.emit(contract, "Transfer").withArgs(from, to, transactionValue);

      // check that balance is updated
      expect((await contract.balanceOf(from))).to.equal(senderBalance - transactionValue);
      expect((await contract.balanceOf(to))).to.equal(transactionValue);

      // check that the authorization is now used
      expect(await contract.authorizationState(from, nonce)).to.be.true;
    });

    it("executes transferWithAuthorizationBatch with a valid authorization", async () => {
      const batch = 5;
      let rs = [];
      let ss = [];
      let vs = [];
      let transactionValues = [];
      let validAfters = [];
      let validBefores = [];
      let nonces = [];
      let senders = [];
      let recipients = [];

      // generate the senders and recipients
      for (let i = 0; i < batch; i++) {
        senders.push(ethers.Wallet.createRandom());
        // Fund sender from admin
        await contract.connect(admin).transfer(senders[i].address, transactionValue);        
        recipients.push(ethers.Wallet.createRandom());
      }

      for (let i = 0; i < batch; i++) {
        sender = senders[i];
        transactionValues.push(transactionValue);
        validAfters.push(0);
        validBefores.push(MAX_UINT256);
        nonce = web3.utils.randomHex(32);
        nonces.push(nonce);
        expect(await contract.authorizationState(sender.address, nonce)).to.be.false;

        const { v, r, s } = signTransferAuthorization(
          sender.address,
          recipients[i].address,
          transactionValue,
          0,
          MAX_UINT256,
          nonce,
          domainSeparator,
          sender.privateKey
        );
        vs.push(v)
        rs.push(r)
        ss.push(s)
      }

      // Execute the transaction
      const result = await contract.transferWithAuthorizationBatch(
        senders.map(sender => sender.address),
        recipients.map(recv => recv.address),
        transactionValues,
        validAfters,
        validBefores,
        nonces,
        vs,
        rs,
        ss
      );

      for (let i = 0; i < batch; i++) {
        // check sender balance is updated
        expect((await contract.balanceOf(senders[i].address))).to.equal(0);
        await expect(result).to.emit(contract, "AuthorizationUsed").withArgs(senders[i].address, nonces[i]).
          to.emit(contract, "Transfer").withArgs(senders[i].address, recipients[i].address, transactionValue);

        // nonce should be used.
        expect(await contract.authorizationState(senders[i].address, nonces[i])).to.be.true;
      }
      // validate recipient balance is updated
      for (let i = 0; i < batch; i++) {
        expect((await contract.balanceOf(recipients[i].address))).to.equal(transactionValue);
      }
    });

    it("reverts transferWithAuthorizationBatch when there is argument length mismatch", async () => {
      const batch = 5;
      let rs = [];
      let ss = [];
      let vs = [];
      let transactionValues = [];
      let senders = [];
      let recipients =[];
      let validAfters = [];
      let validBefores = [];
      let nonces = [];

      // generate the senders and recipients
      for (let i = 0; i < batch; i++) {
        senders.push(ethers.Wallet.createRandom());
        // Fund sender from admin
        await contract.connect(admin).transfer(senders[i].address, transactionValue);        
        recipients.push(ethers.Wallet.createRandom());
      }

      // Create arguments.
      for (let i = 0; i < batch; i++) {
        sender = senders[i];
        transactionValues.push(transactionValue)
        validAfters.push(0)
        validBefores.push(MAX_UINT256)
        nonce = web3.utils.randomHex(32)
        nonces.push(nonce);

        const { v, r, s } = signTransferAuthorization(
          sender.address,
          recipient.address,
          transactionValue,
          0,
          MAX_UINT256,
          nonce,
          domainSeparator,
          sender.privateKey
        );
        vs.push(v)
        rs.push(r)
        ss.push(s)
      }

      let froms = senders.map(sender => sender.address);
      let tos =  recipients.map(recv => recv.address);
      // All test case validation is done in single test to avoid setup overhead.
      let allParams = [froms, tos, transactionValues, validAfters, validBefores, nonces, vs, rs, ss]
      assert(allParams.length == 9, "incomplete check for the number of arguments to transferWithAuthorizationBatch")
      for (let i = 0; i < allParams.length; i++) {
        const currentParam = allParams[i];
        let val = currentParam.pop();
        // Execute the transaction
        await expect(contract.transferWithAuthorizationBatch(
          froms,
          tos,
          transactionValues,
          validAfters,
          validBefores,
          nonces,
          vs,
          rs,
          ss,
        )).to.revertedWithCustomError(contract, "ArgumentLengthMismatch");
        currentParam.push(val);
      }
    });

    it("reverts transferWithAuthorizationBatch when contract is paused", async () => {
      await contract.connect(admin).pause();

      const batch = 5;
      let rs = [];
      let ss = [];
      let vs = [];
      let transactionValues = [];
      let senders = [];
      let recipients = [];
      let validAfters = [];
      let validBefores = [];
      let nonces = [];

      // generate the senders and recipients
      for (let i = 0; i < batch; i++) {
        senders.push(ethers.Wallet.createRandom());
        recipients.push(ethers.Wallet.createRandom());
      }

      // Create arguments.
      for (let i = 0; i < batch; i++) {
        sender = senders[i];
        transactionValues.push(transactionValue);
        validAfters.push(0);
        validBefores.push(MAX_UINT256);
        nonce = web3.utils.randomHex(32);
        nonces.push(nonce);

        const { v, r, s } = signTransferAuthorization(
          sender.address,
          recipient.address,
          transactionValue,
          0,
          MAX_UINT256,
          nonce,
          domainSeparator,
          sender.privateKey
        );
        vs.push(v)
        rs.push(r)
        ss.push(s)
      }

      // Execute the transaction
      await expect(contract.transferWithAuthorizationBatch(
        senders.map(sender => sender.address),
        recipients.map(recv => recv.address),
        transactionValues,
        validAfters,
        validBefores,
        nonces,
        vs,
        rs,
        ss
      )).to.revertedWith("Pausable: paused");

    });

    it("executes a transferWithAuthorization with invalid params", async () => {
      // Sender signs the authorization
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue * 2,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );
      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "InvalidSignature");
    });

    it("executes a transferWithAuthorization when signed with invalid key", async () => {
      let random = ethers.Wallet.createRandom();

      const { v, r, s } = signTransferAuthorization(
        sender.address,
        spender.address,
        transactionValue * 2,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        random.privateKey
      );
      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "InvalidSignature");
    });

    it("reverts if the authorization is not yet valid", async () => {
      let validAfter = await getBlockTimestamp() + 10;
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        validAfter,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );
      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        validAfter,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "AuthorizationInvalid");
    });

    it("reverts if the authorization is expired", async () => {
      const validBefore = await getBlockTimestamp() - 10;
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );
      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        validBefore,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "AuthorizationExpired");
    });

    it("reverts if the authorization has already been used", async () => {
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // Valid transfer
      contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      );
      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "AuthorizationAlreadyUsed");
    });

    it("reverts when nonce that has already been used by the signer", async () => {
      let { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // Valid transfer
      contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s,
      );

      // Execute a different transaction with same nonce.
      ({ v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      ));

      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "AuthorizationAlreadyUsed");
    });

    it("reverts when the sender has insufficient funds", async () => {
      sender = ethers.Wallet.createRandom();
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "ERC20InsufficientBalance");
    });

    it("reverts when the receipient is blocked", async () => {
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      await contract.connect(admin).blockAccounts([recipient.address])

      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, 'BlockedAccountReceiver');
    });

    it("reverts when the spender is blocked", async () => {
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      await contract.connect(admin).blockAccounts([spender.address]);

      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "BlockedAccountSpender");
    });

    it("reverts when the sender is blocked", async () => {
      const { v, r, s } = signTransferAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      await contract.connect(admin).blockAccounts([sender.address])

      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, 'BlockedAccountSender');
    });

    it("reverts when authorization is not for transferWithAuthorization", async () => {
      const { v, r, s } = signReceiveAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );
      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "InvalidSignature");
    });

    it("reverts when contract is paused", async () => {
      await contract.connect(admin).pause();
      const { v, r, s } = signReceiveAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        domainSeparator,
        sender.privateKey
      );
      // Execute the transaction
      await expect(contract.transferWithAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        0,
        MAX_UINT256,
        nonce,
        v,
        r,
        s
      )).to.revertedWith("Pausable: paused");
    });

  });

  describe("receiveWithAuthorization", () => {
    it("executes a receiveWithAuthorization with a valid authorization", async () => {
      const from = sender.address;
      const validAfter = 0;
      const validBefore = MAX_UINT256;

      // Sender signs the authorization
      const { v, r, s } = signReceiveAuthorization(
        sender.address,
        recipient.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // check initial balance
      expect((await contract.balanceOf(from))).to.equal(senderBalance);
      expect((await contract.balanceOf(recipient.address))).to.equal(0);
      expect(await contract.authorizationState(from, nonce)).to.be.false;

      // Execute the transaction
      const result = await contract.connect(recipient).receiveWithAuthorization(
        from,
        recipient.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s,
      );
      // check that balance is updated
      expect((await contract.balanceOf(from))).to.equal(senderBalance - transactionValue);
      expect((await contract.balanceOf(recipient.address))).to.equal(transactionValue);

      await expect(result).to.emit(contract, "AuthorizationUsed").withArgs(from, nonce).
        to.emit(contract, "Transfer").withArgs(from, recipient.address, transactionValue);

      // check that the authorization is now used
      expect(await contract.authorizationState(from, nonce)).to.be.true;
    });

    it("reverts if the caller is not the payee", async () => {
      const from = sender.address;
      const validAfter = 0;
      const validBefore = MAX_UINT256;

      // Sender signs the authorization
      const { v, r, s } = signReceiveAuthorization(
        from,
        recipient.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      await expect(contract.receiveWithAuthorization(
        from,
        recipient.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s
      )).to.revertedWithCustomError(contract, "CallerMustBePayee");
    });

    it("reverts if contract is paused", async () => {
      const from = sender.address;
      const validAfter = 0;
      const validBefore = MAX_UINT256;
      await contract.connect(admin).pause();

      // Sender signs the authorization
      const { v, r, s } = signReceiveAuthorization(
        from,
        recipient.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      await expect(contract.receiveWithAuthorization(
        from,
        recipient.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s
      )).to.revertedWith("Pausable: paused");
    });

    it("reverts if sender is blocked", async () => {
      const from = sender.address;
      const validAfter = 0;
      const validBefore = MAX_UINT256;
      const reciever = addr1;

      // Sender signs the authorization
      const { v, r, s } = signReceiveAuthorization(
        sender.address,
        reciever.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // block sender
      await contract.connect(admin).blockAccounts([sender.address])

      // Execute the transaction
      await expect(contract.connect(reciever).receiveWithAuthorization(
        from,
        reciever.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s,
      )).to.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts if spender(receiver) is blocked", async () => {
      const from = sender.address;
      const validAfter = 0;
      const validBefore = MAX_UINT256;
      const reciever = addr1;

      // Sender signs the authorization
      const { v, r, s } = signReceiveAuthorization(
        sender.address,
        reciever.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // block sender
      await contract.connect(admin).blockAccounts([reciever.address])

      // Execute the transaction
      await expect(contract.connect(reciever).receiveWithAuthorization(
        from,
        reciever.address,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        v,
        r,
        s,
      )).to.revertedWithCustomError(contract, "BlockedAccountSpender");
    });
  });

  describe("cancelAuthorization", () => {
    it("check cancelAuthorization successful case", async () => {
      const from = sender.address;
      const to = recipient.address;
      const validAfter = 0;
      const validBefore = MAX_UINT256;

      // check that the authorization is ununsed
      expect(await contract.authorizationState(from, nonce)).to.be.false;

      // create cancellation
      const cancellation = signCancelAuthorization(
        from,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // cancel the authorization
      await contract.cancelAuthorization(
        from,
        nonce,
        cancellation.v,
        cancellation.r,
        cancellation.s
      );

      // check that the authorization is now used
      expect(await contract.authorizationState(from, nonce)).to.be.true;

      // attempt to use the canceled authorization
      // Sender signs the authorization
      const { v, r, s } = signTransferAuthorization(
        from,
        to,
        transactionValue,
        validAfter,
        validBefore,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      await expect(
        contract.transferWithAuthorization(
          from,
          to,
          transactionValue,
          validAfter,
          validBefore,
          nonce,
          v,
          r,
          s
        )).to.revertedWithCustomError(contract, "AuthorizationAlreadyUsed");
    });

    it("revert when cancellation is already used", async () => {
      // create cancellation
      const from = sender.address;

      // check that the authorization is ununsed
      expect(await contract.authorizationState(from, nonce)).to.be.false;

      // create cancellation
      const cancellation = signCancelAuthorization(
        from,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // cancel the authorization
      await contract.cancelAuthorization(
        from,
        nonce,
        cancellation.v,
        cancellation.r,
        cancellation.s
      );
      expect(await contract.authorizationState(from, nonce)).to.be.true;

      // submit a cancelled authorization again
      await expect(
        contract.cancelAuthorization(
          from,
          nonce,
          cancellation.v,
          cancellation.r,
          cancellation.s
        )).to.revertedWithCustomError(contract, "AuthorizationAlreadyUsed");
    });

    it("reverts if invalid signature", async () => {
      const from = sender.address;
      // create cancellation with
      const cancellation = signCancelAuthorization(
        from,
        web3.utils.randomHex(32),
        domainSeparator,
        sender.privateKey
      );

      // cancel the authorization
      await expect(contract.cancelAuthorization(
        from,
        nonce,
        cancellation.v,
        cancellation.r,
        cancellation.s
      )).to.revertedWithCustomError(contract, "InvalidSignature");
    });

    it("reverts if authorizer is blocked", async () => {
      const from = sender.address;
      await contract.connect(admin).blockAccounts([from])
      // create cancellation
      const cancellation = signCancelAuthorization(
        from,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // cancel the authorization
      await expect(contract.cancelAuthorization(
        from,
        nonce,
        cancellation.v,
        cancellation.r,
        cancellation.s
      )).to.revertedWithCustomError(contract, "BlockedAccountAuthorizer");
    });

    it("reverts if sender is blocked", async () => {
      const from = sender.address;
      await contract.connect(admin).blockAccounts([spender.address])
      // create cancellation
      const cancellation = signCancelAuthorization(
        from,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // cancel the authorization
      await expect(contract.cancelAuthorization(
        from,
        nonce,
        cancellation.v,
        cancellation.r,
        cancellation.s
      )).to.revertedWithCustomError(contract, "BlockedAccountSender");
    });

    it("reverts if contract is paused", async () => {
      await contract.connect(admin).pause();
      const from = sender.address;
      // create cancellation
      const cancellation = signCancelAuthorization(
        from,
        nonce,
        domainSeparator,
        sender.privateKey
      );

      // cancel the authorization
      await expect(contract.cancelAuthorization(
        from,
        nonce,
        cancellation.v,
        cancellation.r,
        cancellation.s
      )).to.revertedWith("Pausable: paused");
    });
  });
});
