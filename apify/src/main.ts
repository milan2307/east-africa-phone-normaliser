/**
 * Apify entry point. One dataset row per input number; one `number-normalised` charge per row (pay-per-event).
 * Pure logic lives in src/core (a copy of the repo's ../src/core, kept identical by `npm run sync-core` + a test).
 */
import { Actor } from "apify";
import { normalise, type Kind } from "./core/normalise.js";
import type { Country } from "./core/plans.js";

export const CHARGE_EVENT = "number-normalised";
export const MAX_NUMBERS = 100_000;

type Input = { numbers?: unknown; defaultCountry?: unknown; kind?: unknown };

export function parseInput(raw: Input | null) {
  const numbers = Array.isArray(raw?.numbers) ? raw!.numbers : [];
  const items = numbers.filter((x): x is string | number => typeof x === "string" || typeof x === "number").map(String).map((s) => s.trim()).filter(Boolean);
  if (!items.length) throw new Error("Input 'numbers' must be a non-empty list of phone, Paybill or Till numbers.");
  if (items.length > MAX_NUMBERS) throw new Error(`At most ${MAX_NUMBERS} numbers per run.`);
  const country = typeof raw?.defaultCountry === "string" ? raw.defaultCountry.toUpperCase() : "KE";
  if (!["KE", "UG", "TZ"].includes(country)) throw new Error("defaultCountry must be KE, UG or TZ.");
  const kind = typeof raw?.kind === "string" ? raw.kind : "auto";
  if (!["auto", "phone", "paybill", "till"].includes(kind)) throw new Error("kind must be auto, phone, paybill or till.");
  return { items, defaultCountry: country as Country, kind: kind as Kind };
}

await Actor.init();
try {
  const input = parseInput(await Actor.getInput<Input>());
  let pushed = 0;
  let stoppedBy: string | undefined;
  for (let i = 0; i < input.items.length; i += 500) {
    const rows = input.items.slice(i, i + 500).map((n) => normalise(n, { defaultCountry: input.defaultCountry, kind: input.kind }));
    const result = await Actor.pushData(rows, CHARGE_EVENT);
    const payPerEvent = Actor.getChargingManager().getPricingInfo().isPayPerEvent;
    pushed += payPerEvent ? Math.min(rows.length, result.chargedCount) : rows.length;
    if (payPerEvent && result.eventChargeLimitReached) { stoppedBy = "the run's maximum charge"; break; }
  }
  await Actor.setStatusMessage(`${pushed} number(s) normalised${stoppedBy ? `; stopped by ${stoppedBy}` : ""}`);
  await Actor.exit();
} catch (err) {
  await Actor.fail(err instanceof Error ? err.message : String(err)); // nothing pushed, nothing charged
}
