/**
 * Independent cross-check against Google libphonenumber's carrier prefixes. Every disagreement must be listed
 * below with the reason we follow the regulator; anything new fails the test so a human looks at it.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { normalise } from "../src/core/normalise.js";

const SAME_OPERATOR: Record<string, string> = { Viettel: "Halotel", "Tanzania Telecom": "TTCL", UTL: "Uganda Telecom", JTL: "Jamii Telecoms Ltd" };
const REGULATOR_DIFFERS: Record<string, string> = {
  "254120": "CA April 2026: 0120 is Jambo Telcoms",
  "254121": "CA April 2026: 0121 not allocated",
  "254124": "CA April 2026: 0124 is Infura",
  "25476": "CA April 2026 splits 076x across Mobile Pay, Eferio, Airtel (762), Finserve, Safaricom",
  "254761": "CA April 2026: 0761 is Eferio Kenya",
  "25562": "TCRA July 2025: 062 allocated to Viettel but not operational",
  "256720": "UCC July 2026: 0720 no longer allocated",
  "256721": "UCC July 2026: only 0721000000-0721099999, Savanna Fibre",
  "256724": "UCC July 2026: 0724 is Hamilton Telecom",
  "256726": "UCC July 2026: Tangerine Limited",
  "256727": "UCC July 2026: Tangerine Limited",
  "256737": "UCC July 2026: 0737000000-0737199999, Blue Crane",
  "256798": "UCC July 2026: not allocated",
  "256799": "UCC July 2026: not allocated",
};

describe("cross-check vs libphonenumber 9.0.42 carrier data", () => {
  const rows = (["254", "255", "256"] as const).flatMap((cc) =>
    fs.readFileSync(new URL(`./fixtures/libphonenumber/carrier-${cc}.txt`, import.meta.url), "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => [cc, ...l.split("|")] as [string, string, string]),
  );
  it("reads all 74 prefixes (31 KE, 19 TZ, 24 UG)", () => expect(rows.length).toBe(74));
  it.each(rows)("+%s %s %s", (cc, prefix, carrier) => {
    const r = normalise("+" + cc + prefix.slice(3).padEnd(9, "0"));
    const expected = SAME_OPERATOR[carrier] ?? carrier;
    const agrees = r.valid && `${r.network} ${r.network_operator}`.toLowerCase().includes(expected.toLowerCase().split(" ")[0]!);
    if (REGULATOR_DIFFERS[prefix]) expect(agrees, `documented difference now agrees: ${prefix}`).toBe(false);
    else expect(agrees, `${prefix} libphonenumber=${carrier} ours=${r.network} (${r.reason})`).toBe(true);
  });
});
