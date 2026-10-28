/** Request contracts. */
import { z } from "zod";
import { MAX_BATCH } from "./core/normalise.js";

const country = z.string().trim().toUpperCase().pipe(z.enum(["KE", "UG", "TZ"]));
const kind = z.enum(["auto", "phone", "paybill", "till"]);

export const singleQuerySchema = z
  .object({ number: z.string().min(1).max(40), country: country.optional(), kind: kind.optional() })
  .strict();

export const batchBodySchema = z
  .object({
    numbers: z.array(z.union([z.string().max(40), z.number().int().nonnegative()])).min(1).max(MAX_BATCH),
    country: country.optional(),
    kind: kind.optional(),
  })
  .strict();
