import { ethers, network } from "hardhat";
import { parseUnits } from "ethers";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import dotenv from "dotenv";

dotenv.config();

/**
 * Smoke test script that forks mainnet and verifies redeem amounts are preserved
 * after upgrading to wYBSV2.
 * 
 * To run this script:
 * 1. Set WYBS_ADDRESS, ADMIN_ADDRESS, BLOCK_NUMBER, etc. in your .env
 * 2. Run: npx hardhat run scripts/wYBS/WindDownSmokeTest.ts --network hardhat
 * 
 * Required environment variables:
 * - WYBS_ADDRESS: The wYBS contract address on mainnet
 * - ADMIN_ADDRESS: The admin address that can upgrade
 * - BLOCK_NUMBER: The block number to fork from
 * - TEST_ADDRESSES: Comma-separated list of addresses to check
 * - NEW_ASSET_ADDRESS or NEW_ASSET_ADDRESS: The new asset address (USDG/PYUSD)
 * - NEW_ASSET_HOLDER_ADDRESS or NEW_ASSET_HOLDER_ADDRESS: Address that holds new asset tokens (will be impersonated)
 * - ASSET_PROTECTION_ADDRESS or ASSET_PROTECTION_ADDRESS: Address with ASSET_PROTECTION_ROLE to unblock accounts (will be impersonated)
 * - FORK_RPC_URL: RPC URL for fork
 * 
 * Note: This script requires forking mainnet, so it may take longer to run.
 */
async function main() {
  // Configuration - should be set via environment variables
  const WYBS_ADDRESS = process.env.WYBS_ADDRESS || "";
  const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || "";
  const BLOCK_NUMBER = process.env.BLOCK_NUMBER 
    ? parseInt(process.env.BLOCK_NUMBER) 
    : 0;
  
  // List of addresses to check redeem amounts for
  const TEST_ADDRESSES = process.env.TEST_ADDRESSES
    ? process.env.TEST_ADDRESSES.split(",").map(addr => addr.trim())
    : [];

  // New asset address (USDG/PYUSD) - should be set via environment variable
  const NEW_ASSET_ADDRESS = process.env.NEW_ASSET_ADDRESS || "";
  
  // Address that holds the new asset tokens (will be impersonated for transfer)
  const NEW_ASSET_HOLDER_ADDRESS = process.env.NEW_ASSET_HOLDER_ADDRESS || "";
  
  // Address with ASSET_PROTECTION_ROLE that can unblock accounts (will be impersonated)
  const ASSET_PROTECTION_ADDRESS = process.env.ASSET_PROTECTION_ADDRESS || "";

  // Validate required configuration
  if (!WYBS_ADDRESS) {
    throw new Error("WYBS_ADDRESS environment variable is required");
  }
  if (!ADMIN_ADDRESS) {
    throw new Error("ADMIN_ADDRESS environment variable is required");
  }
  if (BLOCK_NUMBER === 0) {
    throw new Error("BLOCK_NUMBER environment variable is required");
  }
  if (TEST_ADDRESSES.length === 0) {
    throw new Error("TEST_ADDRESSES environment variable is required (comma-separated list)");
  }
  if (!NEW_ASSET_ADDRESS) {
    throw new Error("NEW_ASSET_ADDRESS or NEW_ASSET_ADDRESS environment variable is required");
  }
  if (!NEW_ASSET_HOLDER_ADDRESS) {
    throw new Error("NEW_ASSET_HOLDER_ADDRESS or NEW_ASSET_HOLDER_ADDRESS environment variable is required");
  }
  if (!ASSET_PROTECTION_ADDRESS) {
    throw new Error("ASSET_PROTECTION_ADDRESS or ASSET_PROTECTION_ADDRESS environment variable is required");
  }

  console.log("=".repeat(80));
  console.log("wYBSV2 Mainnet Fork Smoke Test");
  console.log("=".repeat(80));
  console.log(`Contract Address: ${WYBS_ADDRESS}`);
  console.log(`Admin Address: ${ADMIN_ADDRESS}`);
  console.log(`Block Number: ${BLOCK_NUMBER}`);
  console.log(`Test Addresses: ${TEST_ADDRESSES.join(", ")}`);
  console.log(`New Asset Address: ${NEW_ASSET_ADDRESS}`);
  console.log(`New Asset Holder Address: ${NEW_ASSET_HOLDER_ADDRESS}`);
  console.log(`Asset Protection Address: ${ASSET_PROTECTION_ADDRESS}`);
  console.log("");
  
  // Check if fork is already configured
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log(`Current network block: ${currentBlock}`);

  // Get the contract instance
  const wYBSV1 = await ethers.getContractAt("wYBSV1", WYBS_ADDRESS);
  
  // Get the new asset contract to read decimals
  const newAssetInterface = new ethers.Interface([
    "function decimals() view returns (uint8)",
  ]);
  const newAssetContract = new ethers.Contract(NEW_ASSET_ADDRESS, newAssetInterface, ethers.provider);
  const newAssetDecimalsRaw = await newAssetContract.decimals();
  // Convert to number in case it's a BigInt (ethers v6)
  const newAssetDecimals = Number(newAssetDecimalsRaw);

  console.log(`New asset decimals: ${newAssetDecimals}`);
  console.log("");

  // Unpause contract and unblock test addresses if needed
  console.log("Unpausing contract and unblocking test addresses...");
  await impersonateAccount(ASSET_PROTECTION_ADDRESS);
  await setBalance(ASSET_PROTECTION_ADDRESS, parseUnits("100", 18));
  const assetProtectionSigner = await ethers.getSigner(ASSET_PROTECTION_ADDRESS);
  
  // Check if contract is paused and unpause if needed
  const isPaused = await wYBSV1.paused();
  if (isPaused) {
    console.log(`  Contract is paused, unpausing...`);
    const unpauseTx = await (wYBSV1.connect(assetProtectionSigner) as any).unpause();
    await unpauseTx.wait();
    console.log(`  Unpause transaction: ${unpauseTx.hash}`);
    
    // Verify contract is unpaused
    const isStillPaused = await wYBSV1.paused();
    if (isStillPaused) {
      throw new Error("Failed to unpause contract");
    }
    console.log(`  ✅ Contract unpaused successfully`);
  } else {
    console.log(`  Contract is not paused`);
  }
  
  // Check which addresses are blocked and unblock them
  const addressesToUnblock: string[] = [];
  for (const address of TEST_ADDRESSES) {
    const isBlocked = await wYBSV1.isAddrBlocked(address);
    if (isBlocked) {
      addressesToUnblock.push(address);
      console.log(`  ${address} is blocked, will unblock`);
    }
  }
  
  if (addressesToUnblock.length > 0) {
    console.log(`  Unblocking ${addressesToUnblock.length} address(es)...`);
    const unblockTx = await (wYBSV1.connect(assetProtectionSigner) as any).unblockAccounts(addressesToUnblock);
    await unblockTx.wait();
    console.log(`  Unblock transaction: ${unblockTx.hash}`);
    
    // Verify addresses are unblocked
    for (const address of addressesToUnblock) {
      const isBlocked = await wYBSV1.isAddrBlocked(address);
      if (isBlocked) {
        throw new Error(`Failed to unblock ${address}`);
      }
    }
    console.log(`  ✅ All addresses unblocked successfully`);
  } else {
    console.log(`  No addresses need to be unblocked`);
  }
  console.log("");

  // Get totalAssets BEFORE upgrade (in USDL, 18 decimals)
  console.log("Getting totalAssets BEFORE upgrade...");
  const totalAssetsBefore = await wYBSV1.totalAssets();
  console.log(`  Total assets (USDL, 18 decimals): ${totalAssetsBefore.toString()}`);
  console.log("");

  // Check redeem amounts BEFORE upgrade
  console.log("Checking redeem amounts BEFORE upgrade...");
  const redeemAmountsBefore: { address: string; shares: bigint; assets: bigint }[] = [];
  
  for (const address of TEST_ADDRESSES) {
    const shares = await wYBSV1.balanceOf(address);
    if (shares > 0n) {
      const assets = await wYBSV1.previewRedeem(shares);
      redeemAmountsBefore.push({ address, shares, assets });
      console.log(`  ${address}: ${shares.toString()} shares = ${assets.toString()} USDL (18 decimals)`);
    } else {
      console.log(`  ${address}: 0 shares`);
    }
  }

  if (redeemAmountsBefore.length === 0) {
    console.log("No addresses with shares found, exiting");
    return;
  }

  console.log("");

  // Impersonate admin and fund the account
  console.log("Impersonating admin and funding account...");
  await impersonateAccount(ADMIN_ADDRESS);
  await setBalance(ADMIN_ADDRESS, parseUnits("100", 18));
  const adminSigner = await ethers.getSigner(ADMIN_ADDRESS);

  // Deploy wYBSV2 implementation
  console.log("Deploying wYBSV2 implementation...");
  const WYBSV2 = await ethers.getContractFactory("wYBSV2");
  const wybsV2Impl = await WYBSV2.deploy();
  await wybsV2Impl.waitForDeployment();
  console.log(`  Implementation deployed at: ${await wybsV2Impl.getAddress()}`);

  // Upgrade the contract and initialize in the same transaction
  console.log("Upgrading contract to wYBSV2 and initializing migration...");
  // Encode the initializeV2 function call
  const wybsV2Interface = WYBSV2.interface;
  const initData = wybsV2Interface.encodeFunctionData("initializeV2", [NEW_ASSET_ADDRESS]);
  
  // wYBSV1 inherits from UUPSUpgradeable, so we can use upgradeToAndCall
  const upgradeTx = await (wYBSV1.connect(adminSigner) as any).upgradeToAndCall(
    await wybsV2Impl.getAddress(),
    initData
  );
  await upgradeTx.wait();
  console.log(`  Upgrade and initialization transaction: ${upgradeTx.hash}`);

  // Get wYBSV2 instance - use attach and cast to any for methods not in base type
  const wYBSV2 = WYBSV2.attach(WYBS_ADDRESS) as any;

  // Convert totalAssets from USDL (18 decimals) to new asset amount (newAssetDecimals)
  // Formula: newAssetAmount = totalAssetsUSDL / (10 ** (18 - newAssetDecimals))
  const decimalsDiff = 18 - newAssetDecimals;
  const newAssetAmount = totalAssetsBefore / BigInt(10 ** decimalsDiff);
  
  console.log(`Converting totalAssets from USDL to new asset...`);
  console.log(`  Total assets (USDL, 18 decimals): ${totalAssetsBefore.toString()}`);
  console.log(`  Converted amount (new asset, ${newAssetDecimals} decimals): ${newAssetAmount.toString()}`);
  console.log("");

  // Transfer the new asset amount to the contract
  console.log("Transferring new asset to contract...");
  
  // Create ERC20 interface for transfer
  const erc20Interface = new ethers.Interface([
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ]);
  const newAssetERC20 = new ethers.Contract(NEW_ASSET_ADDRESS, erc20Interface, ethers.provider);
  
  // Impersonate the address that holds the new asset tokens
  console.log(`  Impersonating new asset holder: ${NEW_ASSET_HOLDER_ADDRESS}`);
  await impersonateAccount(NEW_ASSET_HOLDER_ADDRESS);
  await setBalance(NEW_ASSET_HOLDER_ADDRESS, parseUnits("100", 18)); // Fund with ETH for gas
  const holderSigner = await ethers.getSigner(NEW_ASSET_HOLDER_ADDRESS);
  
  // Check the holder's balance
  const holderBalance = await newAssetERC20.balanceOf(NEW_ASSET_HOLDER_ADDRESS);
  console.log(`  Holder balance: ${holderBalance.toString()} (${newAssetDecimals} decimals)`);
  
  if (holderBalance < newAssetAmount) {
    throw new Error(
      `Insufficient balance in holder account. ` +
      `Required: ${newAssetAmount.toString()}, ` +
      `Available: ${holderBalance.toString()}`
    );
  }
  
  // Transfer the new asset from the holder to the contract
  console.log(`  Transferring ${newAssetAmount.toString()} tokens to contract...`);
  const transferTx = await (newAssetERC20.connect(holderSigner) as any).transfer(WYBS_ADDRESS, newAssetAmount);
  await transferTx.wait();
  console.log(`  Transfer transaction: ${transferTx.hash}`);
  
  // Verify the contract received the tokens
  const contractBalance = await newAssetERC20.balanceOf(WYBS_ADDRESS);
  console.log(`  Contract balance: ${contractBalance.toString()}`);
  console.log("");

  // Check redeem amounts AFTER upgrade
  console.log("Checking redeem amounts AFTER upgrade...");
  const redeemAmountsAfter: { address: string; shares: bigint; assets: bigint }[] = [];
  
  for (const { address, shares } of redeemAmountsBefore) {
    const assets = await wYBSV2.previewRedeem(shares);
    redeemAmountsAfter.push({ address, shares, assets });
    console.log(`  ${address}: ${shares.toString()} shares = ${assets.toString()} new asset (${newAssetDecimals} decimals)`);
  }

  console.log("");

  // Compare before and after amounts
  console.log("Comparing before and after amounts...");
  console.log("-".repeat(80));
  
  let allPassed = true;
  for (let i = 0; i < redeemAmountsBefore.length; i++) {
    const before = redeemAmountsBefore[i];
    const after = redeemAmountsAfter[i];

    // Convert USDL amount (18 decimals) to new asset amount (6 decimals) for comparison
    // USDL: 18 decimals, new asset: 6 decimals
    const decimalsDiff = 18 - newAssetDecimals;
    const usdlAmountInNewAssetDecimals = before.assets / BigInt(10 ** decimalsDiff);

    // Allow for rounding differences (1 unit in new asset decimals)
    const tolerance = BigInt(1);
    const diff = after.assets > usdlAmountInNewAssetDecimals
      ? after.assets - usdlAmountInNewAssetDecimals
      : usdlAmountInNewAssetDecimals - after.assets;

    const passed = diff <= tolerance;
    allPassed = allPassed && passed;

    console.log(`Address: ${before.address}`);
    console.log(`  Before: ${before.assets.toString()} USDL (18 decimals) = ${usdlAmountInNewAssetDecimals.toString()} new asset (${newAssetDecimals} decimals)`);
    console.log(`  After:  ${after.assets.toString()} new asset (${newAssetDecimals} decimals)`);
    console.log(`  Difference: ${diff.toString()} (tolerance: ${tolerance.toString()})`);
    console.log(`  Status: ${passed ? "✅ PASS" : "❌ FAIL"}`);
    console.log("");

    if (!passed) {
      console.error(`  ❌ Redeem amount mismatch for ${before.address}`);
      console.error(`     Expected ~${usdlAmountInNewAssetDecimals.toString()}, got ${after.assets.toString()}`);
    }
  }

  console.log("=".repeat(80));
  
  // Execute redeems and verify balances
  console.log("Executing redeems and verifying balances...");
  console.log("-".repeat(80));
  
  let allRedeemsPassed = true;
  for (let i = 0; i < redeemAmountsBefore.length; i++) {
    const before = redeemAmountsBefore[i];
    const after = redeemAmountsAfter[i];
    const testAddress = before.address;
    
    console.log(`\nProcessing redeem for: ${testAddress}`);
    
    // Impersonate the test address and fund with ETH for gas
    await impersonateAccount(testAddress);
    await setBalance(testAddress, parseUnits("10", 18));
    const testSigner = await ethers.getSigner(testAddress);
    
    // Get balances before redeem
    const wYBSBalanceBefore = await wYBSV2.balanceOf(testAddress);
    const newAssetBalanceBefore = await newAssetERC20.balanceOf(testAddress);
    
    console.log(`  wYBS balance before: ${wYBSBalanceBefore.toString()}`);
    console.log(`  New asset balance before: ${newAssetBalanceBefore.toString()}`);
    console.log(`  Expected new asset after redeem: ${after.assets.toString()}`);
    
    // Execute redeem - redeem shares to the same address
    console.log(`  Redeeming ${before.shares.toString()} shares...`);
    const redeemTx = await wYBSV2.connect(testSigner).redeem(before.shares, testAddress, testAddress);
    await redeemTx.wait();
    console.log(`  Redeem transaction: ${redeemTx.hash}`);
    
    // Get balances after redeem
    const wYBSBalanceAfter = await wYBSV2.balanceOf(testAddress);
    const newAssetBalanceAfter = await newAssetERC20.balanceOf(testAddress);
    
    console.log(`  wYBS balance after: ${wYBSBalanceAfter.toString()}`);
    console.log(`  New asset balance after: ${newAssetBalanceAfter.toString()}`);
    
    // Verify wYBS balance is zero
    const wYBSPassed = wYBSBalanceAfter === 0n;
    if (!wYBSPassed) {
      console.error(`  ❌ FAIL: wYBS balance should be 0, got ${wYBSBalanceAfter.toString()}`);
      allRedeemsPassed = false;
    } else {
      console.log(`  ✅ PASS: wYBS balance is zero`);
    }
    
    // Verify new asset balance matches expected amount
    // Calculate expected balance: before + expected redeem amount
    const expectedNewAssetBalance = newAssetBalanceBefore + after.assets;
    const tolerance = BigInt(1); // Allow 1 unit tolerance for rounding
    const balanceDiff = newAssetBalanceAfter > expectedNewAssetBalance
      ? newAssetBalanceAfter - expectedNewAssetBalance
      : expectedNewAssetBalance - newAssetBalanceAfter;
    
    const balancePassed = balanceDiff <= tolerance;
    if (!balancePassed) {
      console.error(`  ❌ FAIL: New asset balance mismatch`);
      console.error(`     Expected: ${expectedNewAssetBalance.toString()}`);
      console.error(`     Got: ${newAssetBalanceAfter.toString()}`);
      console.error(`     Difference: ${balanceDiff.toString()} (tolerance: ${tolerance.toString()})`);
      allRedeemsPassed = false;
    } else {
      console.log(`  ✅ PASS: New asset balance is correct`);
      if (balanceDiff > 0n) {
        console.log(`     (within tolerance: ${balanceDiff.toString()})`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(80));
  if (allPassed && allRedeemsPassed) {
    console.log("✅ All tests passed!");
    console.log("  - Redeem amounts preserved after upgrade");
    console.log("  - All redeems executed successfully");
    console.log("  - All balances verified correctly");
  } else {
    if (!allPassed) {
      console.log("❌ Some redeem amounts did not match!");
    }
    if (!allRedeemsPassed) {
      console.log("❌ Some redeems failed or balances are incorrect!");
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

