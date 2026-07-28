import { privateKeyToAccount } from "viem/accounts";
import { type Address, type Hex } from "viem";

// BebopBlend PMM RFQ contract — same address on all supported chains
// (NOT the JAM settlement at 0xbEbEbEb…, which uses a different EIP-712 domain)
const BEBOP_BLEND_ADDRESS: Address = "0xbbbbbBB520d69a9775E85b458C58c648259FAD5F";

export interface QuoteData {
  chain_id: number;
  order_signing_type: string;
  order_type: string;
  onchain_partner_id: number;
  expiry: number;
  taker_address: string;
  maker_address: string;
  maker_nonce: string;
  receiver: string;
  packed_commands: string;
  quotes: Array<{
    taker_token: string;
    maker_token: string;
    taker_amount: string;
    maker_amount: string;
  }>;
}

export async function signQuote(
  quoteData: QuoteData,
  privateKey: string
): Promise<{ signature: string; sign_scheme: string }> {
  // Ensure private key has 0x prefix
  const formattedPrivateKey = privateKey.startsWith("0x")
    ? (privateKey as Hex)
    : (`0x${privateKey}` as Hex);

  const account = privateKeyToAccount(formattedPrivateKey);

  // Aggregate tokens and amounts (in case of multi-order, though we use SingleOrder)
  const takerTokensDict: Record<string, bigint> = {};
  const makerTokensDict: Record<string, bigint> = {};

  for (const partial of quoteData.quotes) {
    const takerToken = partial.taker_token;
    const makerToken = partial.maker_token;
    takerTokensDict[takerToken] =
      (takerTokensDict[takerToken] || 0n) + BigInt(partial.taker_amount);
    makerTokensDict[makerToken] =
      (makerTokensDict[makerToken] || 0n) + BigInt(partial.maker_amount);
  }

  const takerTokens = Object.keys(takerTokensDict);
  const makerTokens = Object.keys(makerTokensDict);
  const takerAmounts = Object.values(takerTokensDict);
  const makerAmounts = Object.values(makerTokensDict);

  const verifyingContract = BEBOP_BLEND_ADDRESS;

  // Build the typed data for EIP712 signing
  if (quoteData.order_signing_type === "SingleOrder") {
    const domain = {
      name: "BebopSettlement",
      version: "2",
      chainId: quoteData.chain_id,
      verifyingContract,
    } as const;

    const types = {
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

    const message = {
      partner_id: BigInt(quoteData.onchain_partner_id),
      expiry: BigInt(quoteData.expiry),
      taker_address: quoteData.taker_address as Address,
      maker_address: quoteData.maker_address as Address,
      maker_nonce: BigInt(quoteData.maker_nonce),
      taker_token: takerTokens[0] as Address,
      maker_token: makerTokens[0] as Address,
      taker_amount: takerAmounts[0],
      maker_amount: makerAmounts[0],
      receiver: quoteData.receiver as Address,
      packed_commands: BigInt(quoteData.packed_commands),
    } as const;

    // Sign the typed data with viem
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: "SingleOrder",
      message,
    });

    return {
      signature,
      sign_scheme: "EIP712",
    };
  } else {
    // MultiOrder type structure (for future use)
    throw new Error("MultiOrder signing not yet implemented");
  }
}
