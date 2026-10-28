/** Local entry point (`npm start`). */
import { serve } from "@hono/node-server";
import { createApp } from "./http-app.js";
import { loadConfig } from "./config.js";
import { createPaymentMiddleware } from "./payments/x402.js";

const config = loadConfig();
const app = createApp(config, await createPaymentMiddleware(config));
serve({ fetch: app.fetch, port: config.port }, ({ port }) => console.log(`EA phone normaliser on http://localhost:${port} (network ${config.network}, payTo ${config.payTo})`));
