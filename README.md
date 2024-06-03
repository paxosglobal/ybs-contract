# Paxos International Yield Bearing Stablecoin Contract

Paxos International-issued USD-collateralized ERC20 yield-bearing stablecoin public smart contract repository.

## Lift Dollar (USDL) 

Lift Dollar (USDL) is an ERC20 token that is centrally minted and burned by Paxos Issuance MENA Ltd. ("Paxos International"), representing the trusted party backing the token with USD.
USDL uses the [`YBS`](contracts/YBS.sol) contract and provides yield through a [rebasing mechanism](#Rebasing). Rebasing, the act of distributing yield, will occur daily. Over time, qualified token holders will see their balance increase as a result of rebasing.

### Roles and Addresses

| Role                   | Address                                    |
| ---------------------- | ------------------------------------------ |
| DEFAULT_ADMIN_ROLE     | 0x65bcf790Cb8ADf60D5f54eC2E10DE8C83886E0AE |
| SUPPLY_CONTROLLER_ROLE | 0xee8557b16a527C5d262FFD7fE0b20c1A47279932 |
| PAUSE_ROLE             | 0xA54E5d5A4C4011bf4A467b54b0F4505b9Ef7D024 |
| ASSET_PROTECTION_ROLE  | 0xA54E5d5A4C4011bf4A467b54b0F4505b9Ef7D024 |
| REBASE_ADMIN_ROLE      | 0x65bcf790Cb8ADf60D5f54eC2E10DE8C83886E0AE |
| REBASE_ROLE            | 0x8CC7488690f507Ca47c3c673c18DefaBEDC4967B |

To guard against centralized control, the addresses above utilize multisignature contracts ([source](https://github.com/paxosglobal/simple-multisig)). Any change requires the presence of a quorum of signers in the same physical location, ensuring that no individual signer can unilaterally influence a change.

### ABI, Address and Verification

The contract abi is in `YBS.abi`. It is the abi of the implementation contract.
Interaction with USDL is done at the address of the proxy at `0xbdC7c08592Ee4aa51D06C27Ee23D5087D65aDbcD`. See on
[etherscan](https://etherscan.io/address/0xbdC7c08592Ee4aa51D06C27Ee23D5087D65aDbcD) for live on-chain details, and the section on bytecode verification below.

### Bytecode verification

The proxy contract and implementation contracts are verified on etherscan at the following links:
https://etherscan.io/address/0xbdC7c08592Ee4aa51D06C27Ee23D5087D65aDbcD#code
https://etherscan.io/address/0xFcA4F4d52b92A6839DA57c4d11B9ac2841d8cBA0#code

## Contract Specification

[`YBS.sol`](contracts/YBS.sol) contract is a rebasing token that implements the ERC20 standard.

### Rebasing

Rebasing is a technique used to adjust token supply by applying a coefficient on shares (i.e. rebaseShares). The YBS contract uses rebasing, through a contract multiplier, to provide yield to token holders. 
This multiplier is multiplied against rebase shares to display the token value. Therefore, as the multiplier increases, a token balance also increases. Furthermore, the contract
does not store token balances, instead it stores rebaseShares for accounts.

Rebasing is performed by the `REBASE_ROLE` through `increaseRebaseMultiplier()`.

The `REBASE_ADMIN_ROLE` has the power to call all rebasing administrative functions, including:
- `setRebaseMultipliers()` : Fail-safe function to protect against multiplier misconfiguration.
- `setRebasePeriod()` : Sets the period at which rebasing occurs, protects against multiple increases within a rebase period.
- `setMaxRebaseRate()` : Sets the upper bound on multiplier increases, protects against larger than expected increases.

The contract has two types of shares: `rebaseShares`, and `fixedShares`. Token holders who own `rebaseShares` will see their balance increase overtime through rebasing, while those who own `fixedShares` will not.
This segregation of shares is needed to prevent blocked accounts from receiving yield.

The contract provides the ability to set the rebase multiplier ahead of time through use of three contract variables: `beforeIncrMult`, `afterIncrMult`, and `multIncrTime`.
The `multIncrTime` is a timestamp that dictates which multiplier is active when compared against the current block timestamp. For example, if `multIncrTime` is greater than the block timestamp,
`beforeIncrMult` is active. Likewise, if `multIncrTime` is less than or equal to the block timestamp, `afterIncrMult` is active. The contract provides `getActiveMultiplier()` to return the active multiplier.

To audit updates to the multiplier and when rebasing occurs, the contract emits the `RebaseMultipliersSet` event. This event logs the updated `beforeIncrMult`, `afterIncrMult` and `multIncrTime` when a transaction modifies the aforementioned contract state variables. This could be useful for external partners to reconcile off-chain balances with on-chain balances.

### ERC20 Token

The public interface of YBS contract is the ERC20 interface
specified by [EIP-20](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md).

- `name()`
- `symbol()`
- `decimals()`
- `totalSupply()`
- `balanceOf(address who)`
- `transfer(address to, uint256 value)`
- `approve(address spender, uint256 value)`
- `increaseApproval(address spender, uint256 addedValue)`
- `decreaseApproval(address spender, uint256 subtractedValue)`
- `allowance(address owner, address spender)`
- `transferFrom(address from, address to, uint256 value)`

And the ERC20 events.

- `event Transfer(address indexed from, address indexed to, uint256 value)`
- `event Approval(address indexed owner, address indexed spender, uint256 value)`

Typical interaction with the contract will use `transfer` to move the token as payment.
Additionally, a pattern involving `approve` and `transferFrom` can be used to allow another
address to move tokens from your address to a third party without the need for the middle person
to custody the tokens, such as in the 0x protocol.

#### Warning about ERC20 approve front-running

[There is a well known gotcha](https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729) involving the ERC20
`approve` method. The problem occurs when the owner decides to change the allowance of a spender that already has an
allowance. If the spender sends a `transferFrom` transaction at a similar time that the owner sends the new `approve`
transaction and the `transferFrom` by the spender goes through first, then the spender gets to use the original
allowance, and also get approved for the intended new allowance.

To mitigate this risk, we recommend that smart contract users utilize the alternative functions `increaseApproval` and
`decreaseApproval` instead of using `approve` directly.

### Controlling the token supply

The token supply is controlled by `SUPPLY_CONTROLLER_ROLE`. This role that can mint and burn the token
based on the actual movement of cash in and out of the reserve based on
requests for the purchase and redemption of the token.

Supply Control Events

- `SupplyIncreased(address indexed to, uint256 value)`
- `SupplyDecreased(address indexed from, uint256 value)`

### Pausing the contract

In the event of a critical security threat, Paxos International has the ability to pause transfers
and approvals of the token. The ability to pause is controlled by `PAUSE_ROLE`,
following OpenZeppelin's
[PausableUpgradable](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/release-v4.9/contracts/security/PausableUpgradeable.sol).

While paused, the `SUPPLY_CONTROLLER_ROLE` retains the ability to mint and burn tokens.

### Blocklists

The YBS contract contains two block lists. The first, `_blocklist`, prevents transfer to and from addresses in this list. Addresses in `_blocklist` list do
not receive yield. The second, `_blocklistForReceiving`, prevents transfer to addresses in this list.

Both block lists are controlled by `ASSET_PROTECTION_ROLE`. 

Paxos International is regulated by the Financial Services Regulatory Authority (FSRA) of the Abu Dhabi Global Market (ADGM).
As required by the regulator, Paxos International must have a role for asset protection to freeze or seize the assets of a criminal party
when required to do so by law, including by court order or other legal process. As a result, the `ASSET_PROTECTION_ROLE` is able to wipe 
the balance of an address after it is blocked to allow the appropriate authorities to seize the backing assets.

### Delegate Transfer 

To facilitate gas-less transactions, we have adopted [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) and (EIP-2612)[https://eips.ethereum.org/EIPS/eip-2612] proposals.

#### EIP-3009
The public functions, `transferWithAuthorization` and `transferWithAuthorizationBatch` (for multiple transfers request), allows a spender(delegate) to transfer tokens on behalf of the sender, with condition that a signature, conforming to [EIP-712](https://eips.ethereum.org/EIPS/eip-712), is provided by the respective sender.

 ```
function transferWithAuthorization(
    address from,
    address to,
    uint256 value,
    uint256 validAfter,
    uint256 validBefore,
    bytes32 nonce,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;

function transferWithAuthorizationBatch(
    address[] memory from,
    address[] memory to,
    uint256[] memory value,
    uint256[] memory validAfter,
    uint256[] memory validBefore,
    bytes32[] memory nonce,
    uint8[] memory v,
    bytes32[] memory r,
    bytes32[] memory s
) external;
 ```

#### EIP-2612
The sender can establish an allowance for the spender using the permit function, which employs an EIP-712 signature for authorization. Subsequently, the spender can employ the `transferFrom` and `transferFromBatch` functions to initiate transfers on behalf of the sender.

```
function permit(
    address owner,
    address spender,
    uint value,
    uint deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;

function transferFrom(
    address _from,
    address _to,
    uint256 _value
) public returns (bool);

function transferFromBatch(
    address[] calldata _from,
    address[] calldata _to,
    uint256[] calldata _value
) public returns (bool);
```

### Upgradeability Proxy

To facilitate upgradeability on the immutable blockchain we follow a standard
two-contract delegation pattern: a proxy contract represents the token,
while all calls are delegated to an implementation contract.

The delegation uses `delegatecall`, which runs the code of the implementation contract
_in the context of the proxy storage_. This way the implementation pointer can
be changed to a different implementation contract while still keeping the same
data and token contract address, which are really for the proxy contract.

The YBS contract uses OpenZeppelin's [UUPSUpgradeable](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/release-v4.9/contracts/proxy/utils/UUPSUpgradeable.sol).

## Security Audits

Independent security audits were conducted and can be found [here](audits).

## Development

To setup the development environment run:

`npm install`

To compile the YBS contract run:

`npx hardhat compile`

To run unit tests:

`npx hardhat test`

You can also run `npx hardhat coverage` to see a coverage report.
