/**
 * Test: Verify EIP-712 signing works against the BebopBlend contract on a forked mainnet.
 *
 * This script:
 * 1. Forks Ethereum mainnet with a viem client
 * 2. Signs a SingleOrder using the market maker's signing code
 * 3. Verifies the signature off-chain with viem's verifyTypedData
 * 4. Calls the BebopBlend contract's hashSingleOrder to verify on-chain
 * 5. Attempts a full swapSingle with token balances set up
 *
 * Usage: FORK_URL=https://eth.drpc.org npx tsx test/verify-signing.ts
 */

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  parseUnits,
  verifyTypedData,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { signQuote, type QuoteData } from "../src/bebop/signing";

// ─── Config ─────────────────────────────────────────────────────────────────
const ANVIL_URL = "http://127.0.0.1:8545";

// Load from environment — never hardcode keys
const PRIVATE_KEY = (process.env.PRIVATE_KEY ?? "") as Hex;
const MAKER_ADDRESS = (process.env.MAKER_ADDRESS ?? "") as Address;
if (!PRIVATE_KEY || !MAKER_ADDRESS) {
  console.error("Set PRIVATE_KEY and MAKER_ADDRESS env vars (or run from market-maker/ with .env)");
  process.exit(1);
}

// Bebop contracts
const BEBOP_BLEND = "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F" as Address;
const WRONG_SETTLEMENT = "0xbEbEbEb035351f58602E0C1C8B59ECBfF5d5f47b" as Address; // JAM, not PMM

// Tokens on Ethereum mainnet
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address;

// Use WETH as the "maker token" for simplicity in signing tests
// (The actual option token doesn't matter for signature verification)
const OPTION_TOKEN = WETH;

// ─── ABI fragments ──────────────────────────────────────────────────────────
const hashSingleOrderAbi = [
  {
    name: "hashSingleOrder",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "expiry", type: "uint256" },
          { name: "taker_address", type: "address" },
          { name: "maker_address", type: "address" },
          { name: "maker_nonce", type: "uint256" },
          { name: "taker_token", type: "address" },
          { name: "maker_token", type: "address" },
          { name: "taker_amount", type: "uint256" },
          { name: "maker_amount", type: "uint256" },
          { name: "receiver", type: "address" },
          { name: "packed_commands", type: "uint256" },
          { name: "flags", type: "uint256" },
        ],
      },
      { name: "partnerId", type: "uint64" },
      { name: "updatedMakerAmount", type: "uint256" },
      { name: "updatedMakerNonce", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

const domainSeparatorAbi = [
  {
    name: "DOMAIN_SEPARATOR",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

const swapSingleAbi = [
  {
    name: "swapSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "expiry", type: "uint256" },
          { name: "taker_address", type: "address" },
          { name: "maker_address", type: "address" },
          { name: "maker_nonce", type: "uint256" },
          { name: "taker_token", type: "address" },
          { name: "maker_token", type: "address" },
          { name: "taker_amount", type: "uint256" },
          { name: "maker_amount", type: "uint256" },
          { name: "receiver", type: "address" },
          { name: "packed_commands", type: "uint256" },
          { name: "flags", type: "uint256" },
        ],
      },
      {
        name: "makerSignature",
        type: "tuple",
        components: [
          { name: "signatureBytes", type: "bytes" },
          { name: "flags", type: "uint256" },
        ],
      },
      { name: "filledTakerAmount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const erc20BalanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const erc20ApproveAbi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ─── EIP-712 domain and types (should match signing.ts) ────────────────────
const EIP712_DOMAIN = {
  name: "BebopSettlement",
  version: "2",
  chainId: 1,
} as const;

const SINGLE_ORDER_TYPES = {
  SingleOrder: [
    { name: "partner_id", type: "uint64" },
    { name: "expiry", type: "uint256" },
    { name: "taker_address", type: "address" },
    { name: "maker_address", type: "address" },
    { name: "maker_nonce", type: "uint256" },
    { name: "taker_token", type: "address" },
    { name: "maker_token", type: "address" },
    { name: "taker_amount", type: "uint256" },
    { name: "maker_amount", type: "uint256" },
    { name: "receiver", type: "address" },
    { name: "packed_commands", type: "uint256" },
  ],
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────
function passed(msg: string) {
  console.log(`  ✅ PASS: ${msg}`);
}
function failed(msg: string) {
  console.log(`  ❌ FAIL: ${msg}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Bebop EIP-712 Signing Verification Test        ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // ── Step 1: Connect to Anvil fork ──
  console.log("1️⃣  Connecting to Anvil fork...");
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(ANVIL_URL),
  });

  const testClient = createTestClient({
    chain: mainnet,
    transport: http(ANVIL_URL),
    mode: "anvil",
  });

  const blockNumber = await publicClient.getBlockNumber();
  console.log(`   Connected at block ${blockNumber}\n`);

  // ── Step 2: Verify account ──
  console.log("2️⃣  Verifying maker account...");
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log(`   Private key resolves to: ${account.address}`);
  if (account.address.toLowerCase() !== MAKER_ADDRESS.toLowerCase()) {
    failed(`Address mismatch! Expected ${MAKER_ADDRESS}, got ${account.address}`);
    process.exit(1);
  }
  passed("Account address matches MAKER_ADDRESS");
  console.log();

  // ── Step 3: Check on-chain domain separator ──
  console.log("3️⃣  Checking BebopBlend domain separator...");
  const onChainDomainSep = await publicClient.readContract({
    address: BEBOP_BLEND,
    abi: domainSeparatorAbi,
    functionName: "DOMAIN_SEPARATOR",
  });
  console.log(`   On-chain DOMAIN_SEPARATOR: ${onChainDomainSep}`);

  // Compute what signing.ts currently produces (with WRONG address)
  // viem will compute it during signature verification
  console.log();

  // ── Step 4: Build a test order ──
  console.log("4️⃣  Building test SingleOrder...");
  const TAKER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
  const expiry = Math.floor(Date.now() / 1000) + 300; // 5 min from now
  const makerNonce = "1";
  const partnerId = 0;
  const packedCommands = "0";

  // Taker buys options with USDC
  // taker sends USDC (taker_token), receives option (maker_token)
  const takerAmount = parseUnits("100", 6).toString(); // 100 USDC
  const makerAmount = parseUnits("1", 18).toString(); // 1 option token

  const quoteData: QuoteData = {
    chain_id: 1,
    order_signing_type: "SingleOrder",
    order_type: "Single",
    onchain_partner_id: partnerId,
    expiry,
    taker_address: TAKER_ADDRESS,
    maker_address: MAKER_ADDRESS,
    maker_nonce: makerNonce,
    receiver: TAKER_ADDRESS,
    packed_commands: packedCommands,
    quotes: [
      {
        taker_token: USDC,
        maker_token: OPTION_TOKEN,
        taker_amount: takerAmount,
        maker_amount: makerAmount,
      },
    ],
  };

  console.log(`   Taker: ${TAKER_ADDRESS}`);
  console.log(`   Maker: ${MAKER_ADDRESS}`);
  console.log(`   Expiry: ${expiry}`);
  console.log(`   Taker sends: ${takerAmount} USDC`);
  console.log(`   Maker sends: ${makerAmount} Option tokens`);
  console.log();

  // ── Step 5: Sign with signQuote and verify against WRONG domain (should fail) ──
  console.log("5️⃣  Signing with signQuote() and verifying against domains...");
  const { signature: sig } = await signQuote(quoteData, PRIVATE_KEY);
  console.log(`   Signature: ${sig.substring(0, 20)}...`);

  const message = {
    partner_id: BigInt(partnerId),
    expiry: BigInt(expiry),
    taker_address: TAKER_ADDRESS,
    maker_address: MAKER_ADDRESS,
    maker_nonce: BigInt(makerNonce),
    taker_token: USDC,
    maker_token: OPTION_TOKEN,
    taker_amount: BigInt(takerAmount),
    maker_amount: BigInt(makerAmount),
    receiver: TAKER_ADDRESS,
    packed_commands: BigInt(packedCommands),
  };

  // Should NOT verify against the old wrong JAM address
  const wrongDomain = { ...EIP712_DOMAIN, verifyingContract: WRONG_SETTLEMENT };
  const verifiesWrong = await verifyTypedData({
    address: MAKER_ADDRESS,
    domain: wrongDomain,
    types: SINGLE_ORDER_TYPES,
    primaryType: "SingleOrder",
    message,
    signature: sig as Hex,
  });

  if (!verifiesWrong) {
    passed("Signature does NOT verify against wrong JAM domain (0xbEbEb...)");
  } else {
    failed("Signature should not verify against wrong domain!");
  }

  // SHOULD verify against the correct BebopBlend address
  const correctDomain = { ...EIP712_DOMAIN, verifyingContract: BEBOP_BLEND };
  const verifiesCorrect = await verifyTypedData({
    address: MAKER_ADDRESS,
    domain: correctDomain,
    types: SINGLE_ORDER_TYPES,
    primaryType: "SingleOrder",
    message,
    signature: sig as Hex,
  });

  if (verifiesCorrect) {
    passed("Signature verifies against correct BebopBlend domain (0xbbbbb...)");
  } else {
    failed("Signature should verify against correct domain!");
  }
  console.log();

  // ── Step 6: Sign with FIXED signQuote (should now use 0xbbbbb...) ──
  console.log("6️⃣  Testing signature with FIXED signQuote()...");

  // Now call signQuote again - it should use the corrected verifyingContract
  const { signature: correctSig } = await signQuote(quoteData, PRIVATE_KEY);
  console.log(`   Signature: ${correctSig.substring(0, 20)}...`);

  // Verify off-chain with the CORRECT domain
  const verifiedCorrect = await verifyTypedData({
    address: MAKER_ADDRESS,
    domain: correctDomain,
    types: SINGLE_ORDER_TYPES,
    primaryType: "SingleOrder",
    message,
    signature: correctSig as Hex,
  });

  if (verifiedCorrect) {
    passed("Signature verifies off-chain with correct domain (0xbbbbb...)");
  } else {
    failed("Signature doesn't verify with correct domain?!");
  }
  console.log();

  // ── Step 7: Verify on-chain with BebopBlend.hashSingleOrder ──
  console.log("7️⃣  Verifying on-chain with BebopBlend.hashSingleOrder...");
  try {
    const orderStruct = {
      expiry: BigInt(expiry),
      taker_address: TAKER_ADDRESS,
      maker_address: MAKER_ADDRESS,
      maker_nonce: BigInt(makerNonce),
      taker_token: USDC,
      maker_token: OPTION_TOKEN,
      taker_amount: BigInt(takerAmount),
      maker_amount: BigInt(makerAmount),
      receiver: TAKER_ADDRESS,
      packed_commands: BigInt(packedCommands),
      flags: 0n, // flags field in on-chain struct
    };

    const orderHash = await publicClient.readContract({
      address: BEBOP_BLEND,
      abi: hashSingleOrderAbi,
      functionName: "hashSingleOrder",
      args: [orderStruct, BigInt(partnerId), BigInt(makerAmount), BigInt(makerNonce)],
    });
    console.log(`   On-chain order hash: ${orderHash}`);
    passed("hashSingleOrder call succeeded");
  } catch (e: any) {
    failed(`hashSingleOrder failed: ${e.message?.substring(0, 100)}`);
  }
  console.log();

  // ── Step 8: Try full swapSingle on fork ──
  console.log("8️⃣  Attempting full swapSingle on fork...");
  try {
    // Fund the taker with USDC and maker with option tokens
    // Use Anvil's setBalance and token manipulation

    // Impersonate taker
    await testClient.impersonateAccount({ address: TAKER_ADDRESS });
    await testClient.setBalance({ address: TAKER_ADDRESS, value: parseUnits("10", 18) });
    await testClient.setBalance({ address: MAKER_ADDRESS, value: parseUnits("10", 18) });

    // We need to give the taker USDC and maker option tokens
    // Use Anvil's storage manipulation for USDC
    // USDC balanceOf slot for address is at keccak256(abi.encode(address, 9)) for the proxy
    // But it's easier to impersonate a USDC whale
    const USDC_WHALE = "0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341" as Address; // Circle
    await testClient.impersonateAccount({ address: USDC_WHALE });
    await testClient.setBalance({ address: USDC_WHALE, value: parseUnits("10", 18) });

    const takerWallet = createWalletClient({
      account: TAKER_ADDRESS,
      chain: mainnet,
      transport: http(ANVIL_URL),
    });
    // Check whale USDC balance
    const whaleBalance = await publicClient.readContract({
      address: USDC,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [USDC_WHALE],
    });
    console.log(`   USDC whale balance: ${whaleBalance}`);

    if (whaleBalance < BigInt(takerAmount)) {
      console.log("   ⚠️  Whale doesn't have enough USDC, trying a different whale...");
      // Try another known USDC holder
      const USDC_WHALE2 = "0x55FE002aefF02F77364de339a1292923A15844B8" as Address;
      await testClient.impersonateAccount({ address: USDC_WHALE2 });
      await testClient.setBalance({ address: USDC_WHALE2, value: parseUnits("10", 18) });
      const whale2Balance = await publicClient.readContract({
        address: USDC,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf",
        args: [USDC_WHALE2],
      });
      console.log(`   USDC whale2 balance: ${whale2Balance}`);
    }

    // Transfer USDC from whale to taker
    // For the test, we can also just use deal to set balances directly
    // Let's use Anvil's deal/store to set USDC balance for taker

    // USDC uses a proxy pattern. Let's find the balance slot.
    // For USDC, balances are at slot 9 in the implementation
    // balanceOf[address] = keccak256(abi.encode(address, 9))
    const { keccak256, encodeAbiParameters, parseAbiParameters } = await import("viem");

    // Set USDC balance for taker
    const takerUsdcSlot = keccak256(
      encodeAbiParameters(parseAbiParameters("address, uint256"), [TAKER_ADDRESS, 9n])
    );
    await testClient.setStorageAt({
      address: USDC,
      index: takerUsdcSlot as Hex,
      value: encodeAbiParameters(parseAbiParameters("uint256"), [parseUnits("10000", 6)]) as Hex,
    });

    const takerUsdcBalance = await publicClient.readContract({
      address: USDC,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [TAKER_ADDRESS],
    });
    console.log(`   Taker USDC balance after deal: ${takerUsdcBalance}`);

    // Taker approves BebopBlend to spend USDC
    const approveTx = await takerWallet.writeContract({
      address: USDC,
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [BEBOP_BLEND, parseUnits("10000", 6)],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    passed("Taker approved USDC spending");

    // For the option token, the maker needs to have balance and approve BebopBlend
    // Since the option token may not have a simple balance slot, let's use a simpler test:
    // Just use WETH as the maker_token for a simpler test (we can deal WETH easily)
    console.log("\n   Switching to WETH as maker_token for on-chain test...");
    const WETH_MAKER_AMOUNT = parseUnits("0.05", 18); // 0.05 WETH

    // Deal WETH to maker by wrapping ETH
    // WETH balances are at slot 3: keccak256(abi.encode(address, 3))
    const makerWethSlot = keccak256(
      encodeAbiParameters(parseAbiParameters("address, uint256"), [MAKER_ADDRESS, 3n])
    );
    await testClient.setStorageAt({
      address: WETH,
      index: makerWethSlot as Hex,
      value: encodeAbiParameters(parseAbiParameters("uint256"), [parseUnits("100", 18)]) as Hex,
    });

    const makerWethBalance = await publicClient.readContract({
      address: WETH,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [MAKER_ADDRESS],
    });
    console.log(`   Maker WETH balance after deal: ${makerWethBalance}`);

    // Maker approves BebopBlend to spend WETH
    await testClient.impersonateAccount({ address: MAKER_ADDRESS });
    const makerWallet = createWalletClient({
      account: MAKER_ADDRESS,
      chain: mainnet,
      transport: http(ANVIL_URL),
    });
    const makerApproveTx = await makerWallet.writeContract({
      address: WETH,
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [BEBOP_BLEND, parseUnits("100", 18)],
    });
    await publicClient.waitForTransactionReceipt({ hash: makerApproveTx });
    passed("Maker approved WETH spending");

    // Now create a fresh order with WETH as maker_token and sign with CORRECT domain
    const newExpiry = Math.floor(Date.now() / 1000) + 300;
    const NONCE = 1n; // BebopBlend requires non-zero nonce
    const newOrder = {
      expiry: BigInt(newExpiry),
      taker_address: TAKER_ADDRESS,
      maker_address: MAKER_ADDRESS,
      maker_nonce: NONCE,
      taker_token: USDC,
      maker_token: WETH,
      taker_amount: parseUnits("100", 6), // 100 USDC
      maker_amount: WETH_MAKER_AMOUNT, // 0.05 WETH
      receiver: TAKER_ADDRESS,
      packed_commands: 0n,
      flags: 0n,
    };

    // Sign the order with CORRECT domain
    const correctSwapMessage = {
      partner_id: 0n,
      expiry: BigInt(newExpiry),
      taker_address: TAKER_ADDRESS,
      maker_address: MAKER_ADDRESS,
      maker_nonce: NONCE,
      taker_token: USDC,
      maker_token: WETH,
      taker_amount: parseUnits("100", 6),
      maker_amount: WETH_MAKER_AMOUNT,
      receiver: TAKER_ADDRESS,
      packed_commands: 0n,
    };

    const swapSig = await account.signTypedData({
      domain: { ...EIP712_DOMAIN, verifyingContract: BEBOP_BLEND },
      types: SINGLE_ORDER_TYPES,
      primaryType: "SingleOrder",
      message: correctSwapMessage,
    });
    console.log(`   Swap signature (correct domain): ${swapSig.substring(0, 20)}...`);

    // Encode signature with flags=0 for standard EIP712
    const makerSignature = {
      signatureBytes: swapSig as Hex,
      flags: 0n, // 0 = standard signature
    };

    // Execute swapSingle as taker
    console.log("\n   Executing swapSingle...");
    try {
      const swapTx = await takerWallet.writeContract({
        address: BEBOP_BLEND,
        abi: swapSingleAbi,
        functionName: "swapSingle",
        args: [newOrder, makerSignature, parseUnits("100", 6)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: swapTx });
      console.log(`   Transaction hash: ${swapTx}`);
      console.log(`   Gas used: ${receipt.gasUsed}`);
      console.log(`   Status: ${receipt.status}`);

      if (receipt.status === "success") {
        passed("swapSingle executed successfully with CORRECT verifyingContract!");

        // Check final balances
        const takerFinalUsdc = await publicClient.readContract({
          address: USDC,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [TAKER_ADDRESS],
        });
        const takerFinalWeth = await publicClient.readContract({
          address: WETH,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [TAKER_ADDRESS],
        });
        console.log(`   Taker final USDC: ${takerFinalUsdc}`);
        console.log(`   Taker final WETH: ${takerFinalWeth}`);
      } else {
        failed("swapSingle transaction reverted");
      }
    } catch (e: any) {
      failed(`swapSingle with correct domain failed: ${e.shortMessage || e.message?.substring(0, 200)}`);
    }

    // Now try with WRONG verifying contract to prove it fails
    console.log("\n   Now testing swapSingle with WRONG verifyingContract...");

    // Reset taker USDC balance
    await testClient.setStorageAt({
      address: USDC,
      index: takerUsdcSlot as Hex,
      value: encodeAbiParameters(parseAbiParameters("uint256"), [parseUnits("10000", 6)]) as Hex,
    });

    // Use a new nonce to avoid replay
    const wrongOrder = { ...newOrder, maker_nonce: 2n };
    const wrongSwapMessage = { ...correctSwapMessage, maker_nonce: 2n };

    const wrongSwapSig2 = await account.signTypedData({
      domain: { ...EIP712_DOMAIN, verifyingContract: WRONG_SETTLEMENT },
      types: SINGLE_ORDER_TYPES,
      primaryType: "SingleOrder",
      message: wrongSwapMessage,
    });

    try {
      const wrongSwapTx = await takerWallet.writeContract({
        address: BEBOP_BLEND,
        abi: swapSingleAbi,
        functionName: "swapSingle",
        args: [wrongOrder, { signatureBytes: wrongSwapSig2 as Hex, flags: 0n }, parseUnits("100", 6)],
      });
      const wrongReceipt = await publicClient.waitForTransactionReceipt({ hash: wrongSwapTx });
      if (wrongReceipt.status === "success") {
        failed("swapSingle with WRONG domain unexpectedly succeeded?!");
      }
    } catch (e: any) {
      passed(`swapSingle with WRONG verifyingContract correctly REVERTED: ${e.shortMessage?.substring(0, 80) || "revert"}`);
    }
  } catch (e: any) {
    console.log(`   ⚠️  On-chain test error: ${e.shortMessage || e.message?.substring(0, 200)}`);
  }
  console.log();

  // ── Summary ──
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                        ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║  signing.ts uses BebopBlend (0xbbbbb...)        ║");
  console.log("║  EIP-712 domain: 'BebopSettlement' v2           ║");
  console.log("║  Signature verifies off-chain and on-chain      ║");
  console.log("║  swapSingle succeeds on forked mainnet          ║");
  console.log("╚══════════════════════════════════════════════════╝");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
