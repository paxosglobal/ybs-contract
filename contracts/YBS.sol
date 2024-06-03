// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {AccessControlDefaultAdminRulesUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlDefaultAdminRulesUpgradeable.sol"; // solhint-disable-line max-line-length
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol"; // solhint-disable-line max-line-length
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {EIP2612} from "./lib/EIP2612.sol";
import {EIP3009} from "./lib/EIP3009.sol";
import {EIP712} from "./lib/EIP712.sol";

/**
 * @title YBS contract
 * @dev Yield Bearing Stablecoin is a Pausable ERC20 token where token holders are allowed to earn yield.
 */
contract YBS is
    IERC20MetadataUpgradeable,
    AccessControlDefaultAdminRulesUpgradeable,
    UUPSUpgradeable,
    EIP2612,
    EIP3009
{
    // ERC20 Info
    string public name;
    string public symbol;
    uint8 public decimals;

    // REBASING
    // Total rebase shares
    uint256 public totalRebaseShares;
    // Total fixed shares
    uint256 public totalFixedShares;
    // Base value for rebaseMultiplier
    uint256 private constant _BASE = 1e18;
    // Contract rebase multipliers for rebase shares
    // multiplier effective before the increase time
    uint256 public beforeIncrMult;
    // multiplier effective after the increase time
    uint256 public afterIncrMult;
    // The time at which the multiplier changes from beforeIncrMult to afterIncrMult
    uint256 public multIncrTime;
    // The rebasing period to increment multIncrTime
    uint256 public rebasePeriod;
    // The max rate increase between beforeIncrMult -> afterIncrMult
    uint256 public maxRebaseRate;
    // Mapping of rebase shares per account
    mapping(address => uint256) private _rebaseShares;
    // Mapping of fixed shares per account
    mapping(address => uint256) private _fixedShares;

    // BLOCKLIST / FREEZE & SEIZE
    // Mapping of block/freeze status per account
    mapping(address => bool) private _blocklist;
    mapping(address => bool) private _blocklistForReceiving;

    // ERC20 Allowance
    mapping(address => mapping(address => uint256)) private _allowances;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * Expected storage slots used by this contract, 50.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[35] private __gap_YBS; // solhint-disable-line var-name-mixedcase

    // Access control roles
    // keccak256("SUPPLY_CONTROLLER_ROLE")
    bytes32 public constant SUPPLY_CONTROLLER_ROLE = 0x9c00d6f280439b1dfa4da90321e0a3f3c2e87280f4d07fea9fa43ff2cf02df2b;
    // keccak256("PAUSE_ROLE")
    bytes32 public constant PAUSE_ROLE = 0x139c2898040ef16910dc9f44dc697df79363da767d8bc92f2e310312b816e46d;
    // keccak256("ASSET_PROTECTION_ROLE")
    bytes32 public constant ASSET_PROTECTION_ROLE = 0xe3e4f9d7569515307c0cdec302af069a93c9e33f325269bac70e6e22465a9796;
    // keccak256("REBASE_ADMIN_ROLE")
    bytes32 public constant REBASE_ADMIN_ROLE = 0x1def088e742814a6c13355302c4cd95da961f82267b7106f2e38fbc5414a570e;
    // keccak256("REBASE_ROLE")
    bytes32 public constant REBASE_ROLE = 0x2cb8fee3430f011f8ea5df36a120dd5a293aa25c9ca88cc51159a94f41f768bb;

    // Events
    event AccountBlocked(address indexed account);
    event AccountUnblocked(address indexed account);
    event AccountBlockedFromReceivingToken(address indexed account);
    event AccountUnblockedFromReceivingToken(address indexed account);
    event BlockedAccountWiped(address indexed account);
    event RebasePeriodSet(uint256 indexed value);
    event MaxRebaseRateSet(uint256 indexed value);
    event RebaseMultipliersSet(uint256 indexed beforeIncrMult_, uint256 indexed afterIncrMult_, uint256 indexed multIncrTime_);
    event SupplyIncreased(address indexed to, uint256 value);
    event SupplyDecreased(address indexed from, uint256 value);

    // ERC20 Errors from https://eips.ethereum.org/EIPS/eip-6093
    error ERC20InsufficientBalance(
        address sender,
        uint256 shares,
        uint256 sharesNeeded
    );
    error ERC20InvalidSender(address sender);
    error ERC20InvalidReceiver(address receiver);
    error ERC20InsufficientAllowance(
        address spender,
        uint256 allowance,
        uint256 needed
    );
    error ERC20InvalidApprover(address approver);
    error ERC20InvalidSpender(address spender);

    // YBS Errors
    error InsufficientSupply(
        address sender,
        uint256 shares,
        uint256 sharesNeeded
    );
    error InvalidRebaseMultiplier(uint256 multiplier);
    error InvalidRebaseRate(uint256 rate);
    error InvalidMaxRebaseRate(uint256 value);
    error NextIncreaseAlreadySet();
    error UnexpectedTotalSupply();
    error ZeroSharesFromValue(uint256 value);
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract
     * @dev Called on deployment, only can be called once.
     * @param name_ the token name
     * @param symbol_ the token symbol
     * @param decimals_ the token decimals
     * @param admin address of the default admin
     * @param supplyController address of the supply controller
     * @param pauser address of the pauser
     * @param assetProtector address of the asset protector
     * @param rebaserAdmin address of the rebaser-admin
     * @param rebaser address of the rebaser
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address admin,
        address supplyController,
        address pauser,
        address assetProtector,
        address rebaserAdmin,
        address rebaser
    ) external initializer {
        if (supplyController == address(0) || pauser == address(0) || assetProtector == address(0) || 
            rebaserAdmin == address(0) || rebaser == address(0)) {
            revert ZeroAddress();
        } 

        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        _setRebasePeriod(0);
        _setMaxRebaseRate(0);
        _setRebaseMultipliers(_BASE, _BASE, 0, 0);

        __AccessControlDefaultAdminRules_init(3 hours, admin);
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(SUPPLY_CONTROLLER_ROLE, supplyController);
        _grantRole(PAUSE_ROLE, pauser);
        _grantRole(ASSET_PROTECTION_ROLE, assetProtector);
        _grantRole(REBASE_ADMIN_ROLE, rebaserAdmin);
        _grantRole(REBASE_ROLE, rebaser);
    }

    /**
     * @notice Pauses transfers.
     * @dev Restricted to PAUSE_ROLE.
     * @dev Inherits the _pause function from @openzeppelin/PausableUpgradeable contract.
     */
    function pause() external onlyRole(PAUSE_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses transfers.
     * @dev Restricted to PAUSE_ROLE.
     * @dev Inherits the _unpause function from @openzeppelin/PausableUpgradeable contract.
     */
    function unpause() external onlyRole(PAUSE_ROLE) {
        _unpause();
    }

    /**
     * @notice Batch block accounts.
     * @dev Restricted to ASSET_PROTECTION_ROLE.
     * @param addresses list of addresses to block.
     */
    function blockAccounts(
        address[] calldata addresses
    ) external onlyRole(ASSET_PROTECTION_ROLE) {
        for (uint256 i = 0; i < addresses.length;) {
            _blockAccount(addresses[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Blocks multiple accounts at once from receiving funds.
     * @dev Restricted to ASSET_PROTECTION_ROLE.
     * @param addresses An array of addresses to be blocked.
     */
    function blockAccountsFromReceiving(
        address[] calldata addresses
    ) external onlyRole(ASSET_PROTECTION_ROLE) {
        for (uint256 i = 0; i < addresses.length; ) {
            _blocklistForReceiving[addresses[i]] = true;
            emit AccountBlockedFromReceivingToken(addresses[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Batch unblock accounts.
     * @dev Restricted to ASSET_PROTECTION_ROLE.
     * @param addresses list of addresses to unblock.
     */
    function unblockAccounts(
        address[] calldata addresses
    ) external onlyRole(ASSET_PROTECTION_ROLE) {
        for (uint256 i = 0; i < addresses.length;) {
            _unblockAccount(addresses[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Removes multiple accounts from the receiving blocklist at once.
     * @dev Restricted to ASSET_PROTECTION_ROLE.
     * @param addresses An array of addresses to be removed from the receiving blocklist.
     */
    function unblockAccountsFromReceiving(
        address[] calldata addresses
    ) external onlyRole(ASSET_PROTECTION_ROLE) {
        for (uint256 i = 0; i < addresses.length;) {
            delete _blocklistForReceiving[addresses[i]];
            emit AccountUnblockedFromReceivingToken(addresses[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice Sets the rebase period.
     * @dev Restricted to REBASE_ADMIN_ROLE.
     * @param rebasePeriod_ the new rebase period.
     */
    function setRebasePeriod(
        uint256 rebasePeriod_
    ) external onlyRole(REBASE_ADMIN_ROLE) {
        _setRebasePeriod(rebasePeriod_);
    }

    /**
     * @notice Sets the max rebase rate.
     * @dev Restricted to REBASE_ADMIN_ROLE.
     * @param maxRebaseRate_ The new max rebase rate.
     */
    function setMaxRebaseRate(
        uint256 maxRebaseRate_
    ) external onlyRole(REBASE_ADMIN_ROLE) {
        _setMaxRebaseRate(maxRebaseRate_);
    }

    /**
     * @notice Sets the rebase multipliers and increase time.
     * @dev Restricted to REBASE_ADMIN_ROLE.
     * @param beforeIncrMult_ the contract rebase multiplier before increase
     * @param afterIncrMult_ the contract rebase multiplier after increase
     * @param multIncrTime_ the multiplier increase time
     * @param expectedTotalSupply the expected total supply after the increase based on afterIncrMult_.
     */
    function setRebaseMultipliers(
        uint256 beforeIncrMult_,
        uint256 afterIncrMult_,
        uint256 multIncrTime_,
        uint256 expectedTotalSupply
    ) external onlyRole(REBASE_ADMIN_ROLE) {
        _setRebaseMultipliers(beforeIncrMult_, afterIncrMult_, multIncrTime_, expectedTotalSupply);
    }

    /**
     * @notice Increases the next multiplier and sets the increase time.
     * @dev Restricted to REBASE_ROLE.
     * @param rebaseRate the increase rate for the next multiplier
     * @param expectedTotalSupply the expected total supply after the rebaseRate is applied.
     */
    function increaseRebaseMultiplier(
        uint256 rebaseRate,
        uint256 expectedTotalSupply
    ) external onlyRole(REBASE_ROLE) {
        // Revert if already been set, corrective actions should use setRebaseMultipliers()
        if (multIncrTime > block.timestamp) {
            revert NextIncreaseAlreadySet();
        }
        
        if (rebaseRate > maxRebaseRate) {
            revert InvalidRebaseRate(rebaseRate);
        }

        uint256 multIncrTime_ = multIncrTime + rebasePeriod;
        uint256 afterIncrMult_ = (afterIncrMult * (_BASE + rebaseRate)) / _BASE;

        _setRebaseMultipliers(afterIncrMult, afterIncrMult_, multIncrTime_, expectedTotalSupply);
    }

    /**
     * @notice Returns the active rebase multiplier
     * @return An uint256 representing the multiplier
     */
    function getActiveMultiplier() external view returns (uint256) {
        return _getActiveMultiplier();
    }

    /**
     * @notice Returns the total supply
     * @dev Converts rebase and fixed shares to tokens.
     * @return An uint256 representing the total supply
     */
    function totalSupply() external view returns (uint256) {
        return
            _convertRebaseSharesToTokens(totalRebaseShares) + totalFixedShares;
    }

    /**
     * @notice Gets the balance of the specified account.
     * @dev Converts an account's rebase and fixed shares to tokens.
     * @param account account to get the balance for.
     * @return An uint256 representing the amount owned by the passed account.
     */
    function balanceOf(address account) external view returns (uint256) {
        return
            _convertRebaseSharesToTokens(_rebaseShares[account]) +
            _fixedShares[account];
    }

    /**
     * @dev Returns rebase shares of an account.
     * @param account account to get the shares for.
     * @return An uint256 representing shares.
     */
    function rebaseSharesOf(address account) external view returns (uint256) {
        return _rebaseShares[account];
    }

    /**
     * @dev Returns fixed shares of an account.
     * @param account account to get the shares for.
     * @return An uint256 representing shares.
     */
    function fixedSharesOf(address account) external view returns (uint256) {
        return _fixedShares[account];
    }

    /**
     * @dev Function to check whether the address is currently blocked.
     * @param addr The address to check if blocked.
     * @return A bool representing whether the given address is blocked.
     */
    function isAddrBlocked(address addr) public view override returns (bool) {
        return _blocklist[addr];
    }

    /**
     * @dev Function to check whether the address is currently blocked for receiving.
     * @param addr The address to check if blocked for receiving.
     * @return A bool representing whether the given address is blocked for receiving.
     */
    function isAddrBlockedForReceiving(address addr) public view returns (bool) {
        return _blocklistForReceiving[addr];
    }

    /**
     * Get domain Separator.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() public view override returns (bytes32) {
        return EIP712.makeDomainSeparator(name, "1");
    }

    /**
     * @notice Increases the total supply by minting the specified number of tokens to the supply controller account.
     * @dev Converts to underlying rebase shares and checks if results in overflow for total supply.
     * Restricted to SUPPLY_CONTROLLER_ROLE.
     * @param value The number of tokens to add.
     * @return success A boolean that indicates if the operation was successful.
     */
    function increaseSupply(
        uint256 value
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) returns (bool success) {
        // Do not allow blocked address to get rebaseShares. This check is only necessary for increaseSupply,
        // as decreaseSupply will revert due to insufficient rebaseShares.
        if (_blocklist[msg.sender]) revert BlockedAccountSender();

        uint256 shares = _convertToRebaseShares(value);
        if (shares == 0) revert ZeroSharesFromValue(value);

        // An increase in rebaseShares should also update the afterIncrMult_, if required.
        _updateAfterIncrMultIfRequired(value, true);

        totalRebaseShares += shares;

        // overflow check - attempt to convert back to total supply,
        // This should revert if large amount results in overflow of total supply
        _convertRebaseSharesToTokens(totalRebaseShares) + totalFixedShares;

        unchecked {
            _rebaseShares[msg.sender] += shares;
        }

        emit SupplyIncreased(msg.sender, value);
        emit Transfer(address(0), msg.sender, value);
        return true;
    }

    /**
     * @notice Decreases the total supply by burning the specified number of tokens from the supply controller account.
     * @dev Converts to underlying rebase shares. Restricted to SUPPLY_CONTROLLER_ROLE.
     * @param value The number of tokens to remove.
     * @return success A boolean that indicates if the operation was successful.
     */
    function decreaseSupply(
        uint256 value
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) returns (bool success) {
        uint256 shares = _convertToRebaseShares(value);
        if (shares == 0) revert ZeroSharesFromValue(value);

        uint256 hasShares = _rebaseShares[msg.sender];
        if (shares > hasShares)
            revert InsufficientSupply(msg.sender, hasShares, shares);

        // Decrease in rebaseShares should also update the afterIncrMult_, if required.
        _updateAfterIncrMultIfRequired(value, false);

        unchecked {
            // Cannot underflow, shares must be less than or equal to hasShares to get here
            _rebaseShares[msg.sender] -= shares;
            // Cannot underflow, totalRebaseShares is always greater than or equal to account shares 
            totalRebaseShares -= shares;
        }

        emit SupplyDecreased(msg.sender, value);
        emit Transfer(msg.sender, address(0), value);
        return true;
    }

    /**
     * @notice Transfer token to a specified address from msg.sender
     * @param to The address to transfer to.
     * @param amount The amount to be transferred.
     * @return True when the operation was successful.
     */
    function transfer(
        address to,
        uint256 amount
    ) public whenNotPaused returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
     * Beware that changing an allowance with this method brings the risk that someone may use both the old
     * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
     * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     * 
     * Recommended to use increaseApproval and decreaseApproval instead
     * 
     * @param spender The address which will spend the funds.
     * @param amount The amount of tokens to be spent.
     * @return True when the operation was successful.
     */
    function approve(
        address spender,
        uint256 amount
    ) public whenNotPaused returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Function to check the amount of tokens that an owner allowed to a spender.
     * @dev Allowances are represented in tokens rather than rebase shares.
     * @param owner The address which owns the funds.
     * @param spender The address which will spend the funds.
     * @return A uint256 specifying the amount of tokens still available for the spender.
     */
    function allowance(
        address owner,
        address spender
    ) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev Increase the amount of tokens that an owner allowed to a spender.
     *
     * To increment allowed value is better to use this function to avoid 2 calls (and wait until the first transaction
     * is mined) instead of approve.
     * @param spender The address which will spend the funds.
     * @param addedValue The amount of tokens to increase the allowance by.
     * @return True when the operation was successful.
     */
    function increaseApproval(
        address spender,
        uint256 addedValue
    ) public whenNotPaused returns (bool) {
        _beforeApprove(spender);
        _allowances[msg.sender][spender] += addedValue;
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    /**
     * @dev Decrease the amount of tokens that an owner allowed to a spender.
     *
     * To decrement allowed value is better to use this function to avoid 2 calls
     * (and wait until the first transaction is mined) instead of approve.
     * @param spender The address which will spend the funds.
     * @param subtractedValue The amount of tokens to decrease the allowance by.
     * @return True when the operation was successful.
     */
    function decreaseApproval(
        address spender,
        uint256 subtractedValue
    ) public whenNotPaused returns (bool) {
        _beforeApprove(spender);
        uint256 oldValue = _allowances[msg.sender][spender];
        if (subtractedValue > oldValue) {
            delete _allowances[msg.sender][spender];
        } else {
            unchecked {
                _allowances[msg.sender][spender] -= subtractedValue;
            }
        }
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    /**
     * @dev Transfer tokens from one address to another
     * @param from The address which you want to send tokens from
     * @param to The address which you want to transfer to
     * @param amount the amount of tokens to be transferred
     * @return True when the operation was successful.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public whenNotPaused returns (bool) {
        if (_blocklist[msg.sender]) revert BlockedAccountSpender();
        _transferFromAllowance(from, to, amount);
        return true;
    }

    /**
     * @dev Transfer tokens from one set of addresses to another set in a single transaction.
     * @param from The addresses which you want to send tokens from
     * @param to The addresses which you want to transfer to
     * @param value The amounts of tokens to be transferred
     * @return True if successful
     */
    function transferFromBatch(
        address[] calldata from,
        address[] calldata to,
        uint256[] calldata value
    ) public whenNotPaused returns (bool)
    {
        if (!(to.length == from.length && value.length == from.length)) revert ArgumentLengthMismatch();
        if (_blocklist[msg.sender]) revert BlockedAccountSpender();
        for (uint256 i = 0; i < from.length;) {
            _transferFromAllowance(from[i], to[i], value[i]);
            unchecked { ++i; }
        }
        return true;
    }

    /**
     * @dev Wipes the balance of a blocked address, and burns the tokens.
     * Restricted to ASSET_PROTECTION_ROLE.
     * @param addr The blocked address to wipe.
     */
    function wipeBlockedAddress(
        address addr
    ) public onlyRole(ASSET_PROTECTION_ROLE) {
        if (!_blocklist[addr]) revert AccountNotBlocked();

        uint256 fixedShares = _fixedShares[addr];
        delete _fixedShares[addr];
        unchecked {
            totalFixedShares -= fixedShares;
        }

        emit BlockedAccountWiped(addr);
        emit SupplyDecreased(addr, fixedShares);
        emit Transfer(addr, address(0), fixedShares);
    }

    /**
     * @dev Internal function to transfer tokens
     * @param from The address to transfer from.
     * @param to The address to transfer to.
     * @param amount The amount to be transferred.
     */
    function _transfer(address from, address to, uint256 amount) internal override {
        if (from == address(0)) revert ERC20InvalidSender(from);
        if (to == address(0)) revert ERC20InvalidReceiver(to);
        if (_blocklist[from]) revert BlockedAccountSender();
        if (_blocklist[to]) revert BlockedAccountReceiver();
        if (_blocklistForReceiving[to]) revert BlockedAccountReceiver();

        uint256 shares = _convertToRebaseShares(amount);
        uint256 fromShares = _rebaseShares[from];
        if (shares > fromShares)
            revert ERC20InsufficientBalance(from, fromShares, shares);

        unchecked {
            _rebaseShares[from] -= shares;
            _rebaseShares[to] += shares;
        }

        emit Transfer(from, to, amount);
    }

    /**
     * @dev Internal function to set the rebase period.
     * @param rebasePeriod_ The new rebase period.
     */
    function _setRebasePeriod(uint256 rebasePeriod_) internal {
        rebasePeriod = rebasePeriod_;

        emit RebasePeriodSet(rebasePeriod_);
    }

    /**
     * @dev Internal function to set the max rebase rate.
     * @param maxRebaseRate_ The new max rebase rate.
     */
    function _setMaxRebaseRate(uint256 maxRebaseRate_) internal {
        if (maxRebaseRate_ > _BASE) {
            revert InvalidMaxRebaseRate(maxRebaseRate_);
        }

        maxRebaseRate = maxRebaseRate_;
        emit MaxRebaseRateSet(maxRebaseRate_);
    }

    /**
     * @dev Internal function to set the rebase multipliers and increase time.
     * @param beforeIncrMult_ The new rebase multiplier before increase.
     * @param afterIncrMult_ The new rebase multiplier after increase.
     * @param multIncrTime_ The rebase multiplier increase time.
     * @param expectedTotalSupply The expected total supply after the increase based on afterIncrMult_.
     */
    function _setRebaseMultipliers(uint256 beforeIncrMult_,
                                   uint256 afterIncrMult_,
                                   uint256 multIncrTime_,
                                   uint256 expectedTotalSupply) internal {
        if (beforeIncrMult_ < _BASE ) {
            revert InvalidRebaseMultiplier(beforeIncrMult_);
        }
        if (afterIncrMult_ < beforeIncrMult_) {
            revert InvalidRebaseMultiplier(afterIncrMult_);
        }
        if ((totalRebaseShares * afterIncrMult_ / _BASE ) + totalFixedShares > expectedTotalSupply) {
            revert UnexpectedTotalSupply();
        }

        beforeIncrMult = beforeIncrMult_;
        afterIncrMult = afterIncrMult_;
        multIncrTime = multIncrTime_;

        emit RebaseMultipliersSet(beforeIncrMult_, afterIncrMult_, multIncrTime_);
    }

    /**
     * @dev required by the OZ UUPS module to authorize an upgrade 
     * of the contract. Restricted to DEFAULT_ADMIN_ROLE.
     */
    function _authorizeUpgrade(
        address
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {} // solhint-disable-line no-empty-blocks

    /**
     * @dev Private helper function used by approve and increase/decreaseApproval
     * @param spender The address which will spend the funds.
     */
    function _beforeApprove(address spender) private view {
        if (msg.sender == address(0)) revert ERC20InvalidApprover(msg.sender);
        if (spender == address(0)) revert ERC20InvalidSpender(spender);
        if (_blocklist[spender]) revert BlockedAccountSpender();
        if (_blocklist[msg.sender]) revert BlockedAccountSender();
    }

    /**
     * @dev Private function to add an account to the _blocklist.
     * The token holder's rebase shares are converted to fixed shares.
     * @param account The account to block.
     */
    function _blockAccount(address account) private {
        _convertRebaseSharesToFixedShares(account);

        _blocklist[account] = true;
        emit AccountBlocked(account);
    }

    /**
     * @dev Private function to remove an account from the _blocklist.
     * The token holder's fixed shares are converted back to rebase shares.
     * @param account The account to unblock.
     */
    function _unblockAccount(address account) private {
        _convertFixedSharesToRebaseShares(account);

        delete _blocklist[account];
        emit AccountUnblocked(account);
    }

    /**
     * @dev Private function that converts rebase shares to fixed shares.
     * @param account The account whose shares will be converted
     */
    function _convertRebaseSharesToFixedShares(address account) private {
        if (_rebaseShares[account] == 0) return;

        uint256 shares = _rebaseShares[account];
        uint256 amount = _convertRebaseSharesToTokens(shares);

        // Decrease in rebaseShares should also update the afterIncrMult_, if required.
        _updateAfterIncrMultIfRequired(amount, false);

        delete _rebaseShares[account];
        unchecked{
            totalRebaseShares -= shares;
        }

        _fixedShares[account] += amount;
        totalFixedShares += amount;
    }

    /**
     * @dev Private function that converts fixed shares to rebase shares.
     * @param account The account whose shares will be converted
     */
    function _convertFixedSharesToRebaseShares(address account) private {
        if (_fixedShares[account] == 0) return;

        uint256 amount = _fixedShares[account];
        uint256 shares = _convertToRebaseShares(amount);
        if (shares == 0) revert ZeroSharesFromValue(amount);

        // An increase in rebaseShares should also update the afterIncrMult_, if required.
        _updateAfterIncrMultIfRequired(amount, true);

        delete _fixedShares[account];
        unchecked {
            totalFixedShares -= amount;
        }


        _rebaseShares[account] += shares;
        totalRebaseShares += shares;
    }

    /**
     * @dev Private function that returns the active rebase multiplier
     * @return An uint256 representing the multiplier
     */
    function _getActiveMultiplier() private view returns (uint256) {
        if (block.timestamp >= multIncrTime) {
            return afterIncrMult;
        }
        
        return beforeIncrMult;
    }

    /**
     * @dev Private function that converts rebase shares to tokens.
     * @param shares The shares to be converted.
     * @return An uint256 representing tokens.
     */
    function _convertRebaseSharesToTokens(
        uint256 shares
    ) private view returns (uint256) {
        return (shares * _getActiveMultiplier()) / _BASE;
    }

    /**
     * @dev Private function that converts tokens to rebase shares.
     * @param amount The amount to be converted.
     * @return An uint256 representing shares.
     */
    function _convertToRebaseShares(
        uint256 amount
    ) private view returns (uint256) {
        return (amount * _BASE) / _getActiveMultiplier();
    }

    /**
     * @dev Set allowance for a given spender, of a given owner.
     * @param owner The address which owns the funds.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be approved.
     */
    function _approve(
        address owner,
        address spender,
        uint256 value
    ) internal override {
        _beforeApprove(spender);
        _allowances[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    /**
     * @dev Internal function to transfer balances from => to.
     * Internal to the contract - see transferFrom and transferFromBatch.
     * @param from The address which you want to send tokens from
     * @param to The address which you want to transfer to
     * @param value the amount of tokens to be transferred
     */
    function _transferFromAllowance(
        address from,
        address to,
        uint256 value
    )
    internal
    {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            if (value > currentAllowance)
                revert ERC20InsufficientAllowance(
                    msg.sender,
                    currentAllowance,
                    value
                );

            unchecked {
                _allowances[from][msg.sender] -= value;
            }
        }

        _transfer(from, to, value);
    }

    /*
     * @dev Private function which updates the afterIncrMult_ if supply
     * of rebase shares has increased and rebase multiplier increase
     * is in progress.
     * @param value The token value of increased rebase shares.
     * @param isValueIncremented Boolean to identify if the token value of rebase shares increased or decreased.
     */
    function _updateAfterIncrMultIfRequired(
        uint256 value,
        bool isValueIncremented
    ) private {
        // Update future multiplier if rebase increase in progress
        if (block.timestamp >= multIncrTime) {
            return;
        }

        /* 
        * Calculation of the new multiplier
        * intValue = if (isValueIncremented) { value } else { -value }
        * after_incr_future_total_supply = (total_rebase_shares * (after_incr_multiplier)) + intValue
        * before_incr_total_supply = (total_rebase_shares * (before_incr_multiplier)) + intValue
        * updated_multiplier = (after_incr_future_total_supply * before_incr_multiplier) /
        *                       before_incr_total_supply
        */
        if (isValueIncremented) {
            afterIncrMult =
                (((totalRebaseShares * afterIncrMult) + (value * _BASE)) * beforeIncrMult) /
                (((totalRebaseShares * beforeIncrMult) + (value * _BASE)));
        } else {
            afterIncrMult =
                (((totalRebaseShares * afterIncrMult) - (value * _BASE)) * beforeIncrMult) /
                (((totalRebaseShares * beforeIncrMult) - (value * _BASE)));
        }

        emit RebaseMultipliersSet(beforeIncrMult, afterIncrMult, multIncrTime);
    }
}
