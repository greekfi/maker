import "dotenv/config";
import WebSocket from "ws";
import { bebop } from "../src/bebop/proto/takerPricing_pb";

const chain = process.env.RELAY_DUMP_CHAIN || "base";
const ws = new WebSocket(`wss://api.bebop.xyz/pmm/${chain}/v3/pricing?format=protobuf`, [], {
  headers: {
    name: process.env.BEBOP_MARKETMAKER || "",
    Authorization: process.env.BEBOP_AUTHORIZATION || "",
  },
});

let printed = 0;
ws.on("open", () => console.error(`open ${chain}`));
ws.on("message", (data: Buffer) => {
  if (printed >= 2) return process.exit(0);
  const u = bebop.BebopPricingUpdate.decode(data);
  console.log(`msg ${printed + 1}: ${u.pairs.length} pairs (${data.length}B)`);
  for (const p of u.pairs) {
    const base = "0x" + Buffer.from(p.base || []).toString("hex");
    const quote = "0x" + Buffer.from(p.quote || []).toString("hex");
    const bid0 = p.bids?.[0];
    const ask0 = p.asks?.[0];
    const bidQty = p.bids?.[1];
    const askQty = p.asks?.[1];
    console.log(`  ${base.slice(0, 12)}.../${quote.slice(0, 12)}...  bid ${bid0}@${bidQty}  ask ${ask0}@${askQty}`);
  }
  printed++;
});
ws.on("error", (e) => { console.error("err", e.message); process.exit(1); });
ws.on("close", (c, r) => { console.error("close", c, r.toString()); process.exit(0); });
setTimeout(() => { console.error("timeout"); process.exit(0); }, 15000);
