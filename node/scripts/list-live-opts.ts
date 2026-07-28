import "dotenv/config";
import { discoverOptionMetadata } from "../src/config/metadata";

const chainId = parseInt(process.env.CHAIN_ID || "8453");
const now = Math.floor(Date.now() / 1000);

const all = await discoverOptionMetadata(chainId);
const live = all.filter((m) => m.expirationTimestamp > now);
live.sort((a, b) => a.expirationTimestamp - b.expirationTimestamp);

console.log(`total=${all.length} live=${live.length} (now=${now})`);
console.log("first 25 live options (soonest first):");
for (const m of live.slice(0, 25)) {
  const d = new Date(m.expirationTimestamp * 1000).toISOString().slice(0, 10);
  console.log(
    `  ${m.address}  expiry=${d}  strike=${m.strike}  isPut=${m.isPut}  coll=${m.collateralAddress.slice(0, 10)}...`,
  );
}
