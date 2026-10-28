/** Vercel entry point (Hono zero-config). */
import type { Hono } from "hono";
import { createApp } from "./http-app.js";
import { loadConfig } from "./config.js";
import { createPaymentMiddleware } from "./payments/x402.js";

const config = loadConfig();
const app: Hono = createApp(config, await createPaymentMiddleware(config));
export default app;
