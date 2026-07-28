// modes/direct.ts
import { Pricer } from "../pricing/pricer";
import { createHttpApi } from "../servers/httpApi";
import { createWsStream } from "../servers/wsStream";

export async function startDirectMode(pricers: Map<number, Pricer>) {
  const httpPort = parseInt(process.env.HTTP_PORT || "3010");
  const wsPort = parseInt(process.env.WS_PORT || "3011");

  // Start HTTP API
  const httpServer = createHttpApi(pricers);
  httpServer.listen(httpPort);
  console.log(`HTTP API listening on port ${httpPort}`);

  // Start WebSocket broadcast
  const wsServer = createWsStream(pricers);
  wsServer.listen(wsPort);
  console.log(`WebSocket stream on port ${wsPort}`);
}
