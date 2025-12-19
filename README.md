# USDL Deprecation Notice

**Lift Dollar (USDL) has been deprecated.**

## USDL Token Contracts

The USDL token contracts are no longer active:

- **Ethereum**: [0xbdC7c08592Ee4aa51D06C27Ee23D5087D65aDbcD](https://etherscan.io/token/0xbdc7c08592ee4aa51d06c27ee23d5087d65adbcd)
- **Arbitrum**: [0x7f850b0ab1988dd17b69ac564c1e2857949e4dee](https://arbiscan.io/token/0x7f850b0ab1988dd17b69ac564c1e2857949e4dee)

## USDL to USDG Migration

Addresses holding USDL on Ethereum and Arbitrum were airdropped **USDG** on Ethereum as a replacement token.

- **USDG on Ethereum**: [0xe343167631d89B6Ffc58B88d6b7fB0228795491D](https://etherscan.io/token/0xe343167631d89B6Ffc58B88d6b7fB0228795491D)

## wUSDL Contract Updates

The wUSDL contract has been upgraded to change the underlying asset:

- **Ethereum**: The underlying asset has been changed to **USDG**
  - **wUSDL Contract**: [0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559](https://etherscan.io/token/0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559)
  - **USDG Contract**: [0xe343167631d89B6Ffc58B88d6b7fB0228795491D](https://etherscan.io/token/0xe343167631d89B6Ffc58B88d6b7fB0228795491D)
- **Arbitrum**: The underlying asset has been changed to **PYUSD**
  - **wUSDL Contract**: [0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559](https://arbiscan.io/token/0x7751E2F4b8ae93EF6B79d86419d42FE3295A4559)
  - **PYUSD Contract**: [0x46850aD61C2B7d64d08c9C754F45254596696984](https://arbiscan.io/token/0x46850aD61C2B7d64d08c9C754F45254596696984)

The USDL equivalent amount of the new backing asset has been deposited to the wUSDL vaults.

### wUSDL Functionality

The wUSDL contract interface remains unchanged and continues to implement the [EIP-4626](https://eips.ethereum.org/EIPS/eip-4626) standard. However, **deposit/mint functionality has been disabled**. Holders can only **redeem/withdraw** their tokens according to the EIP-4626 specification.
