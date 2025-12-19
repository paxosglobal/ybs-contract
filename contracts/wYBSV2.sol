// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {wYBSV1} from "./wYBSV1.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {MathUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/**
 * @title wYBSV2 contract
 * @dev Migrated version of wYBS that uses a new backing asset instead of USDL.
 * Deposits are disabled, only withdrawals/redeems are allowed for the new asset.
 * @custom:security-contact smart-contract-security@paxos.com
 */
// solhint-disable-next-line contract-name-camelcase
contract wYBSV2 is wYBSV1 {
    // New backing asset address
    IERC20MetadataUpgradeable private _newAsset;
    // Snapshot of totalAssets (USDL) at migration time
    // Used to calculate conversions using the original ERC4626 formula
    uint256 private _totalAssetsUSDL;
    // Snapshot of totalSupply (shares) at migration time
    // Used to calculate conversions using the original ERC4626 formula
    uint256 private _totalSupplyShares;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * Expected storage slots used by this contract, 50.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[46] private __gap_wYBSV2; // solhint-disable-line var-name-mixedcase

    // Errors
    error DepositsDisabled();

    /**
     * @notice Initializes the migration to new backing asset
     * @dev Called after upgrade, only can be called once with reinitializer(2)
     * @param newAsset address of the new backing asset (USDG/PYUSD)
     */
    function initializeV2(IERC20MetadataUpgradeable newAsset) external reinitializer(2) {
        if (address(newAsset) == address(0)) {
            revert ZeroAddress();
        }

        // Snapshot the totalAssets (USDL) and totalSupply (shares) at migration time
        // These will be used to calculate conversions using the original ERC4626 formula
        // This avoids double rounding issues by using the exact same calculation as before
        uint256 totalAssetsUSDL = super.totalAssets();
        uint256 totalSupplyShares = super.totalSupply();

        _newAsset = newAsset;
        _totalAssetsUSDL = totalAssetsUSDL;
        _totalSupplyShares = totalSupplyShares;
    }

    /**
     * @dev Returns the address of the underlying asset used by the vault for accounting, depositing, and withdrawing.
     * @return The asset address (new asset after migration).
     */
    function asset() public view virtual override returns (address) {
        return address(_newAsset);
    }

    /**
     * @dev Returns the total amount of the underlying asset that is "managed" by this vault.
     * @return The total amount of assets (new asset after migration).
     * @notice After migration, this returns the actual balance of the new backing asset
     *         rather than a calculated value. This is intentional for the wind-down scenario
     *         where the contract holds the new asset to back all outstanding shares.
     */
    function totalAssets() public view virtual override returns (uint256) {
        return _newAsset.balanceOf(address(this));
    }

    /**
     * @dev Returns the decimals places of the wUSDL token.
     * @dev After migration, wUSDL decimals change to match the new backing asset decimals.
     * @return The decimals (new asset decimals after migration).
     */
    function decimals() public view virtual override returns (uint8) {
        // After migration, wUSDL decimals change to match the new backing asset (e.g., 6 for USDG/PYUSD)
        return _newAsset.decimals();
    }

    /**
     * @dev See {IERC4626-deposit}.
     * Deposits are disabled after migration.
     */
    function deposit(uint256, address) public pure override returns (uint256) {
        revert DepositsDisabled();
    }

    /**
     * @dev See {IERC4626-mint}.
     * Minting is disabled after migration.
     */
    function mint(uint256, address) public pure override returns (uint256) {
        revert DepositsDisabled();
    }

    /**
     * @dev See {IERC4626-maxDeposit}.
     * Returns 0 to disable deposits.
     */
    function maxDeposit(address) public pure override returns (uint256) {
        return 0;
    }

    /**
     * @dev See {IERC4626-maxMint}.
     * Returns 0 to disable minting.
     */
    function maxMint(address) public pure override returns (uint256) {
        return 0;
    }

    /**
     * @dev See {IERC4626-maxWithdraw}.
     * Uses internal balance (18 decimals) for calculations after migration.
     */
    function maxWithdraw(address owner) public view virtual override returns (uint256) {
        // After migration: use internal balance (18 decimals) for conversion
        uint256 sharesInternal = super.balanceOf(owner);
        return _convertToAssets(sharesInternal, MathUpgradeable.Rounding.Down);
    }

    /**
     * @dev See {IERC4626-maxRedeem}.
     * Uses internal balance (18 decimals) for calculations after migration.
     */
    function maxRedeem(address owner) public view virtual override returns (uint256) {
        // After migration: return internal balance (18 decimals)
        return super.balanceOf(owner);
    }

    /**
     * @dev Internal conversion function (from assets to shares) with support for rounding direction.
     * Uses the original ERC4626 formula with snapshot values after migration.
     */
    function _convertToShares(uint256 assets, MathUpgradeable.Rounding rounding) internal view virtual override returns (uint256) {
        // After migration: use the original ERC4626 formula with snapshot values
        // Formula: shares = assets * (totalSupply + 1) / (totalAssets + 1)
        // But assets are in new asset decimals, so we need to convert to USDL equivalent first
        // assets_usdl = assets_new * 10^18 / 10^newAssetDecimals
        // Then: shares = assets_usdl * (totalSupply + 1) / (totalAssets + 1)
        // Combined: shares = assets_new * 10^18 * (totalSupply + 1) / (10^newAssetDecimals * (totalAssets + 1))
        uint8 newAssetDecimals = _newAsset.decimals();
        uint256 decimalsMultiplier = 10 ** uint256(newAssetDecimals);
        
        return MathUpgradeable.mulDiv(
            assets * 1e18,
            _totalSupplyShares + 1,
            (_totalAssetsUSDL + 1) * decimalsMultiplier,
            rounding
        );
    }

    /**
     * @dev Internal conversion function (from shares to assets) with support for rounding direction.
     * Uses the original ERC4626 formula with snapshot values after migration.
     */
    function _convertToAssets(uint256 shares, MathUpgradeable.Rounding rounding) internal view virtual override returns (uint256) {
        // After migration: use the original ERC4626 formula with snapshot values
        // Formula: assets_usdl = shares * (totalAssets + 1) / (totalSupply + 1) [in 18 decimals]
        // Then convert to new asset decimals: assets_new = assets_usdl * 10^newAssetDecimals / 10^18
        // Combined: assets_new = shares * (totalAssets + 1) * 10^newAssetDecimals / ((totalSupply + 1) * 10^18)
        // Use mulDiv to avoid intermediate overflow: (shares * (totalAssets + 1)) * decimalsMultiplier / ((totalSupply + 1) * 1e18)
        uint8 newAssetDecimals = _newAsset.decimals();
        uint256 decimalsMultiplier = 10 ** uint256(newAssetDecimals);
        
        return MathUpgradeable.mulDiv(
            shares * (_totalAssetsUSDL + 1),
            decimalsMultiplier,
            (_totalSupplyShares + 1) * 1e18,
            rounding
        );
    }

    /**
     * @dev Override the _withdraw function to use new asset after migration.
     * @param caller The address which initiated the withdrawal.
     * @param receiver The address which will receive the funds.
     * @param owner The address which owns the funds.
     * @param assets The amount of assets to be withdrawn.
     * @param shares The amount of shares to be burned.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        // After migration: perform blocklist checks (from parent wYBSV1)
        if (isAddrBlocked(receiver)) revert BlockedAccountReceiver();
        if (isAddrBlocked(caller)) revert BlockedAccountSpender();

        // ASSET_PROTECTION_ROLE should only be able to use seizeAssets() to withdraw from a blocked account.
        if (hasRole(ASSET_PROTECTION_ROLE, caller) && isAddrBlocked(owner)) revert InvalidOperation();

        // Handle allowance
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        // Burn shares
        _burn(owner, shares);

        // Transfer new asset instead of old asset (parent would transfer USDL via _asset)
        SafeERC20Upgradeable.safeTransfer(_newAsset, receiver, assets);

        emit Withdraw(caller, receiver, owner, assets, shares);
    }
}

