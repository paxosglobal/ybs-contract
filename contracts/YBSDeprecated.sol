// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol"; // solhint-disable-line max-line-length
import {AccessControlDefaultAdminRulesUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlDefaultAdminRulesUpgradeable.sol"; // solhint-disable-line max-line-length
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title USDL Deprecated Contract
 * @dev Deprecated version that always returns zero balances and supply.
 * This contract maintains ERC20 interface compliance but prevents all transfers.
 * @custom:security-contact smart-contract-security@paxos.com
 */
contract YBSDeprecated is 
    IERC20MetadataUpgradeable,
    AccessControlDefaultAdminRulesUpgradeable,
    UUPSUpgradeable
{
    // Deprecation Error
    error ContractDeprecated();

    /**
     * @dev Returns the name of the token.
     * @return The token name
     */
    function name() external pure returns (string memory) {
        return "Lift Dollar - Deprecated";
    }

    /**
     * @dev Returns the symbol of the token.
     * @return The token symbol
     */
    function symbol() external pure returns (string memory) {
        return "USDL";
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * @return The number of decimals
     */
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /**
     * @dev Returns the total supply of tokens (always 0).
     * @return Always returns 0
     */
    function totalSupply() external pure returns (uint256) {
        return 0;
    }

    /**
     * @dev Returns the balance of the specified account (always 0).
     * @return Always returns 0
     */
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}.
     * @return The amount of tokens still available for the spender
     */
    function allowance(address, address) external pure returns (uint256) {
        return 0;
    }

    /**
     * @dev Transfer tokens (always reverts - contract is deprecated).
     * @return Never returns (always reverts)
     */
    function transfer(address, uint256) external pure returns (bool) {
        revert ContractDeprecated();
    }

    /**
     * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
     * Always reverts - contract is deprecated.
     * @return Never returns (always reverts)
     */
    function approve(address, uint256) external pure returns (bool) {
        revert ContractDeprecated();
    }

    /**
     * @dev Transfer tokens from one address to another (always reverts - contract is deprecated).
     * @return Never returns (always reverts)
     */
    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert ContractDeprecated();
    }

    /**
     * @dev required by the OZ UUPS module to authorize an upgrade 
     * of the contract. Restricted to DEFAULT_ADMIN_ROLE.
     */
    function _authorizeUpgrade(
        address
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {} // solhint-disable-line no-empty-blocks
}

