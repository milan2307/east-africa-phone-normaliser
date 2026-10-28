/**
 * What we sell. Price, description and Bazaar discovery metadata live here and nowhere else.
 */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import type { HTTPRequestContext, RouteConfig } from "@x402/core/server";
import type { AppConfig } from "./config.js";
import { MAX_BATCH, normalise } from "./core/normalise.js";
import { SOURCES } from "./core/plans.js";

export const PRICE_PER_NUMBER_MICRO_USD = 2000; // $0.002
export const PRICE_PER_NUMBER = "$0.002" as const;

/** $0.002 x count, exact in USDC's 6 decimals. Unparseable bodies are priced as 1 (and then answered 400, never settled). */
export function batchPrice(count: number): `$${string}` {
  const n = Number.isInteger(count) && count >= 1 ? Math.min(count, MAX_BATCH) : 1;
  const micro = n * PRICE_PER_NUMBER_MICRO_USD;
  return `$${Math.floor(micro / 1e6)}.${String(micro % 1e6).padStart(6, "0")}`;
}

const SERVICE = "East Africa Phone & Paybill Normaliser";
const TAGS = ["kenya", "uganda", "tanzania", "phone-validation", "m-pesa"];

const singleInputSchema = {
  type: "object",
  properties: {
    number: { type: "string", description: "Phone, Paybill or Till as typed, e.g. 0712 345 678, +256 772 123456, 255754123456, 247247" },
    country: { type: "string", enum: ["KE", "UG", "TZ"], description: "Country for numbers without a country code. Default KE" },
    kind: { type: "string", enum: ["auto", "phone", "paybill", "till"], description: "What the input is. Default auto" },
  },
  required: ["number"],
  additionalProperties: false,
};
const batchInputSchema = {
  type: "object",
  properties: {
    numbers: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_BATCH, description: `1 to ${MAX_BATCH} numbers. Price is $0.002 per number` },
    country: singleInputSchema.properties.country,
    kind: singleInputSchema.properties.kind,
  },
  required: ["numbers"],
  additionalProperties: false,
};

const EXAMPLE = normalise("0712 345 678");
const resultSchema = {
  type: "object",
  properties: {
    input: { type: "string" }, valid: { type: "boolean" }, country: { type: ["string", "null"], enum: ["KE", "UG", "TZ", null] },
    type: { type: "string", enum: ["mobile", "landline", "m2m", "toll_free", "premium", "paybill", "till", "paybill_or_till", "unknown"] },
    e164: { type: ["string", "null"] }, national: { type: ["string", "null"] }, display: { type: ["string", "null"] }, clean: { type: ["string", "null"] },
    network: { type: ["string", "null"] }, network_operator: { type: ["string", "null"] }, range_status: { type: ["string", "null"] }, region: { type: ["string", "null"] },
    check: { type: "string", enum: ["numbering_plan", "format_only", "none"] }, reason: { type: ["string", "null"] },
    notes: { type: "array", items: { type: "string" } }, source: { type: ["object", "null"] },
  },
  required: ["input", "valid", "type", "check"],
};

export type Product = { skillId: string; method: "GET" | "POST"; path: string; price: `$${string}` | ((ctx: HTTPRequestContext) => Promise<`$${string}`>); priceLabel: string; description: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown>; discovery: ReturnType<typeof declareDiscoveryExtension> };

export const PRODUCTS: Product[] = [
  {
    skillId: "ea-phone-normalise",
    method: "GET",
    path: "/v1/normalise",
    price: PRICE_PER_NUMBER,
    priceLabel: "$0.002",
    description:
      "Normalises one Kenyan, Ugandan or Tanzanian phone number to E.164 and says if it is valid, mobile or landline, and which operator the range is allocated to (Safaricom, Airtel, Telkom, MTN, Vodacom, Yas, Halotel, TTCL...), per the official CA, UCC and TCRA numbering plans. Also format-checks M-PESA Paybill/Till numbers (format only, no registry lookup). Not charged on errors.",
    inputSchema: singleInputSchema,
    outputSchema: resultSchema,
    discovery: declareDiscoveryExtension({ input: { number: "0712 345 678", country: "KE" }, inputSchema: singleInputSchema, output: { example: EXAMPLE } }),
  },
  {
    skillId: "ea-phone-normalise-batch",
    method: "POST",
    path: "/v1/normalise/batch",
    price: async (ctx) => {
      const body = (await ctx.adapter.getBody?.()) as { numbers?: unknown } | undefined;
      return batchPrice(Array.isArray(body?.numbers) ? body.numbers.length : 1);
    },
    priceLabel: `$0.002 per number (1-${MAX_BATCH})`,
    description:
      `Normalises up to ${MAX_BATCH} Kenyan, Ugandan or Tanzanian phone, Paybill or Till numbers in one call: E.164, validity, mobile/landline and allocated operator per the official CA, UCC and TCRA numbering plans. Price is $0.002 per number in the request. Paybill/Till are format-checked only. Not charged on errors.`,
    inputSchema: batchInputSchema,
    outputSchema: { type: "object", properties: { count: { type: "integer" }, valid_count: { type: "integer" }, results: { type: "array", items: resultSchema } } },
    discovery: declareDiscoveryExtension({ bodyType: "json", input: { numbers: ["0712345678", "+256772123456", "247247"] }, inputSchema: batchInputSchema, output: { example: { count: 1, valid_count: 1, results: [EXAMPLE] } } }),
  },
];

export function paidRoutes(config: AppConfig): Record<string, RouteConfig> {
  return Object.fromEntries(
    PRODUCTS.map((p) => [
      `${p.method} ${p.path}`,
      {
        accepts: { scheme: "exact", price: p.price, network: config.network, payTo: config.payTo, maxTimeoutSeconds: 300 },
        ...(p.method === "GET" && config.publicOrigin ? { resource: `${config.publicOrigin}${p.path}` } : {}),
        description: p.description,
        mimeType: "application/json",
        serviceName: SERVICE,
        tags: TAGS,
        extensions: p.discovery,
      } satisfies RouteConfig,
    ]),
  );
}

export function catalogue(config: AppConfig) {
  return {
    name: SERVICE,
    payment: { protocol: "x402", scheme: "exact", asset: "USDC", network: config.network },
    routes: PRODUCTS.map((p) => ({ method: p.method, path: p.path, price: p.priceLabel, description: p.description, input_schema: p.inputSchema })),
    sources: Object.values(SOURCES),
    caveats: [
      "Network = operator the number range is allocated to in the official plan. Numbers can be ported; this is not a live registry or HLR lookup.",
      "Paybill/Till: format check only (5-7 digits). It does not confirm the business number exists or who owns it.",
    ],
    billing_note: "Error responses (4xx/5xx) are not settled, so failed calls are free. An invalid number is a successful answer (valid=false) and is charged.",
    free_routes: ["GET /", "GET /health"],
  };
}
