/** HTTP surface: validate -> pure function -> JSON. Payment middleware runs before paid routes. */
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type { AppConfig } from "./config.js";
import { normalise, normaliseBatch } from "./core/normalise.js";
import { PRODUCTS, catalogue } from "./products.js";
import { batchBodySchema, singleQuerySchema } from "./schema.js";

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export function createApp(config: AppConfig, payment: MiddlewareHandler): Hono {
  const app = new Hono();
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  });
  app.get("/", (c) => c.json(catalogue(config)));
  app.get("/health", (c) => c.json({ ok: true }));

  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json(errorBody("body_too_large", "Max 16 KB"), 413) }));
  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "HEAD") return c.json(errorBody("method_not_allowed", "Use GET or POST"), 405);
    await next();
  });
  app.use("/v1/*", payment);

  const [single, batch] = PRODUCTS as [(typeof PRODUCTS)[0], (typeof PRODUCTS)[1]];
  app.get(single.path, (c) => {
    const q = singleQuerySchema.safeParse(c.req.query());
    if (!q.success) return c.json(errorBody("invalid_request", q.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; ")), 400);
    return c.json(normalise(q.data.number, { defaultCountry: q.data.country, kind: q.data.kind }));
  });
  app.post(batch.path, async (c) => {
    const raw = await c.req.json().catch(() => undefined);
    const b = batchBodySchema.safeParse(raw);
    if (!b.success) return c.json(errorBody("invalid_request", b.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")), 400);
    return c.json(normaliseBatch(b.data.numbers, { defaultCountry: b.data.country, kind: b.data.kind }));
  });

  app.onError((err, c) => {
    console.error("unhandled_error", err instanceof Error ? err.name : typeof err);
    return c.json(errorBody("internal_error", "Unexpected error"), 500);
  });
  app.notFound((c) => c.json(errorBody("not_found", "No such route"), 404));
  return app;
}
