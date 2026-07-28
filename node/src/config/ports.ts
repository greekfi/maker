// Port configuration
// Railway injects PORT env var — all modes should fall back to it.

/** Port for the HTTP quote API (direct mode) */
export const HTTP_PORT = parseInt(process.env.HTTP_PORT || process.env.PORT || "3010");

/** Port for the WebSocket pricing stream (direct mode) */
export const WS_PORT = parseInt(process.env.WS_PORT || process.env.PORT || "3011");

/** Port for the WebSocket relay server (relay mode) */
export const RELAY_WS_PORT = parseInt(process.env.RELAY_WS_PORT || process.env.PORT || "3004");
