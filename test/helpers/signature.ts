const ecsign = require("ethereumjs-util");
const web3 = require("web3");

export const PERMIT_TYPEHASH = web3.utils.keccak256(
  "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
);

export const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = web3.utils.keccak256(
  "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
);

export const RECEIVE_WITH_AUTHORIZATION_TYPEHASH = web3.utils.keccak256(
  "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
);

export const CANCEL_AUTHORIZATION_TYPEHASH = web3.utils.keccak256(
  "CancelAuthorization(address authorizer,bytes32 nonce)"
);

export const MAX_UINT256 =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function strip0x(v: string) {
  return v.replace(/^0x/, "");
}

export function signPermit(
  owner: string,
  spender: any,
  value: number,
  nonce: number,
  deadline: string | number,
  domainSeparator: any,
  privateKey: string
) {
  return signEIP712(
    domainSeparator,
    PERMIT_TYPEHASH,
    ["address", "address", "uint256", "uint256", "uint256"],
    [owner, spender, value, nonce, deadline],
    privateKey
  );
}

export function signTransferAuthorization(
  from: string,
  to: string,
  value: number,
  validAfter: number,
  validBefore: string | number,
  nonce: number,
  domainSeparator: any,
  privateKey: string
) {
  return signEIP712(
    domainSeparator,
    TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
    ["address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [from, to, value, validAfter, validBefore, nonce],
    privateKey
  );
}

export function signReceiveAuthorization(
  from: string,
  to: string,
  value: number,
  validAfter: number,
  validBefore: string,
  nonce: number,
  domainSeparator: any,
  privateKey: string
) {
  return signEIP712(
    domainSeparator,
    RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
    ["address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [from, to, value, validAfter, validBefore, nonce],
    privateKey
  );
}

export function signCancelAuthorization(
  signer: string,
  nonce: number,
  domainSeparator: any,
  privateKey: string
) {
  return signEIP712(
    domainSeparator,
    CANCEL_AUTHORIZATION_TYPEHASH,
    ["address", "bytes32"],
    [signer, nonce],
    privateKey
  );
}

function signEIP712(
  domainSeparator: string,
  typeHash: any,
  types: string[],
  parameters: any[],
  privateKey: string
) {
  const digest = web3.utils.keccak256(
    "0x1901" +
    strip0x(domainSeparator) +
    strip0x(
      web3.utils.keccak256(
        web3.eth.abi.encodeParameters(
          ["bytes32", ...types],
          [typeHash, ...parameters]
        )
      )
    )
  );

  return ecSign(digest, privateKey);
}

function ecSign(digest: any, privateKey: string) {
  const { v, r, s } = ecsign.ecsign(
    bufferFromHexString(digest),
    bufferFromHexString(privateKey)
  );

  return { v, r: hexStringFromBuffer(r), s: hexStringFromBuffer(s) };
}

function bufferFromHexString(hex: string) {
  return Buffer.from(strip0x(hex), "hex");
}

function hexStringFromBuffer(buf: Buffer) {
  return "0x" + buf.toString("hex");
}
