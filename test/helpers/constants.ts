
import { keccak256, toUtf8Bytes } from "ethers";
import { ZeroHash } from "ethers";

export const NAME = "Yield Bearing Stablecoin";
export const SYMBOL = "YBS";
export const DECIMALS = 18;
export const CONTRACT_NAME = "YBSV1"

export const W_NAME = "Wrapped Yield Bearing Stablecoin";
export const W_SYMBOL = "wYBS";
export const W_CONTRACT_NAME = "wYBSV1"

export const roles = {
  SUPPLY_CONTROLLER_ROLE: keccak256(toUtf8Bytes("SUPPLY_CONTROLLER_ROLE")),
  PAUSE_ROLE: keccak256(toUtf8Bytes("PAUSE_ROLE")),
  ASSET_PROTECTION_ROLE: keccak256(toUtf8Bytes("ASSET_PROTECTION_ROLE")),
  REBASE_ADMIN_ROLE: keccak256(toUtf8Bytes("REBASE_ADMIN_ROLE")),
  REBASE_ROLE: keccak256(toUtf8Bytes("REBASE_ROLE")),
  DEFAULT_ADMIN_ROLE: ZeroHash,
};
