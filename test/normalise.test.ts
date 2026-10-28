import { describe, expect, it } from "vitest";
import { normalise, normaliseBatch, stripFormatting } from "../src/core/normalise.js";
import { PLANS, lookup, type Country } from "../src/core/plans.js";

const n = (input: unknown, country?: Country, kind?: "auto" | "phone" | "paybill" | "till") => normalise(input, { defaultCountry: country, kind });

describe("input clean-up", () => {
  it.each([
    "0712345678", "0712 345 678", "0712-345-678", "(0712) 345.678", "+254712345678", "+254 712 345 678", "254712345678",
    "00254712345678", "712345678", "+254 (0)712 345 678", "+2540712345678", "tel:+254712345678", " 0712345678 ", "0712\u00a0345\u00a0678", "０７１２３４５６７８",
  ])("%j -> +254712345678", (input) => {
    const r = n(input);
    expect(r).toMatchObject({ valid: true, country: "KE", type: "mobile", e164: "+254712345678", national: "0712345678", display: "+254 712 345 678", clean: "254712345678", network: "Safaricom", check: "numbering_plan" });
  });
  it("accepts a JS number", () => expect(n(254712345678).e164).toBe("+254712345678"));
  it("stripFormatting keeps digits and +", () => expect(stripFormatting(" tel:+254 (712) 34-56.78 ")).toBe("+254712345678"));
  it.each([["", "empty"], ["abc", "not_digits"], ["07l2345678", "not_digits"], ["1".repeat(41), "too_long"], [null, "empty"], [{}, "empty"], [1.5, "empty"]])("%j -> invalid (%s)", (input, reason) => {
    expect(n(input)).toMatchObject({ valid: false, reason, e164: null });
  });
  it("rejects country codes outside KE/UG/TZ", () => {
    expect(n("+1 202 555 0100")).toMatchObject({ valid: false, reason: "unsupported_country_code" });
    expect(n("+250 788 123 456")).toMatchObject({ valid: false, reason: "unsupported_country_code" });
    expect(n("0044 20 7946 0000")).toMatchObject({ valid: false, reason: "unsupported_country_code" });
  });
});

describe("Kenya (CA April 2026)", () => {
  it.each([
    ["0110123456", "Safaricom"], ["0119123456", "Safaricom"], ["0140123456", "Safaricom"], ["0700123456", "Safaricom"], ["0729123456", "Safaricom"],
    ["0740123456", "Safaricom"], ["0745123456", "Safaricom"], ["0748123456", "Safaricom"], ["0757123456", "Safaricom"], ["0768123456", "Safaricom"], ["0799123456", "Safaricom"],
    ["0100123456", "Airtel"], ["0108123456", "Airtel"], ["0730123456", "Airtel"], ["0739123456", "Airtel"], ["0750123456", "Airtel"], ["0756123456", "Airtel"], ["0762123456", "Airtel"], ["0780123456", "Airtel"], ["0789123456", "Airtel"],
    ["0770123456", "Telkom"], ["0779123456", "Telkom"],
    ["0763123456", "Equitel"], ["0766123456", "Equitel"],
    ["0120123456", "Jambo Telcoms Ltd"], ["0124123456", "Infura Ltd"], ["0126123456", "Hidiga Investments Ltd"], ["0128123456", "Webtribe Ltd"], ["0130123456", "NRG Media Ltd"],
    ["0744123456", "Homelands Media Ltd"], ["0747123456", "Jamii Telecoms Ltd"], ["0760123456", "Mobile Pay Ltd"], ["0761123456", "Eferio Kenya Ltd"],
  ])("%s -> %s mobile", (num, network) => {
    expect(n(num)).toMatchObject({ valid: true, type: "mobile", network, range_status: "operational" });
  });
  it("Finserve keeps its legal name next to the brand", () => expect(n("0765000000").network_operator).toBe("Finserve Africa Ltd"));
  it("mobile results carry the porting caveat and the CA source", () => {
    const r = n("0722000000");
    expect(r.notes.join(" ")).toMatch(/ported/);
    expect(r.notes.join(" ")).toMatch(/not a live registry/);
    expect(r.source?.url).toMatch(/ca\.go\.ke/);
  });
  it("0749 is valid but flagged as IEBC special use", () => expect(n("0749123456")).toMatchObject({ valid: true, network: "IEBC", range_status: "special_use" }));
  it("0199 is a test range, never issued", () => expect(n("0199123456")).toMatchObject({ valid: false, reason: "test_range_not_issued", e164: "+254199123456" }));
  it.each(["0767123456", "0121123456", "0131123456", "0150123456", "0170123456", "0190123456"])("%s -> prefix not allocated", (num) => {
    expect(n(num)).toMatchObject({ valid: false, reason: "prefix_not_allocated", e164: null });
  });
  it.each(["0135123456", "0139123456", "0180123456"])("%s -> valid but secondary source (libphonenumber only)", (num) => {
    const r = n(num);
    expect(r).toMatchObject({ valid: true, range_status: "secondary_source" });
    expect(r.source?.url).toMatch(/libphonenumber/);
  });
  it("length checks", () => {
    expect(n("071234567")).toMatchObject({ valid: false, reason: "too_short" });
    expect(n("07123456789")).toMatchObject({ valid: false, reason: "too_long" });
    expect(n("+2547123456789")).toMatchObject({ valid: false, reason: "too_long" });
  });
  it.each([
    ["020 2222222", "Nairobi City", "+254202222222"], ["020 222222", "Nairobi City", "+25420222222"], ["041 2345678", "Mombasa, Mariakani, Kilifi", "+254412345678"],
    ["057 2023456", "Kisumu, Maseno, Siaya", "+254572023456"], ["0692012345", "Marsabit, Moyale", "+254692012345"],
  ])("landline %s -> %s", (num, region, e164) => {
    expect(n(num)).toMatchObject({ valid: true, type: "landline", region, e164, network: null });
  });
  it("landline below the area's minimum length is too short", () => expect(n("041 234567")).toMatchObject({ valid: false, reason: "too_short", type: "landline" }));
  it("063 is reserved", () => expect(n("0632012345")).toMatchObject({ valid: false, reason: "prefix_not_allocated" }));
  it("M2M numbers are 12 digits", () => {
    expect(n("+254300123456789")).toMatchObject({ valid: true, type: "m2m", display: "+254 300 123 456 789" });
    expect(n("+254300123456")).toMatchObject({ valid: false, reason: "too_short" });
  });
  it("toll-free and premium", () => {
    expect(n("0800 720 000")).toMatchObject({ valid: true, type: "toll_free" });
    expect(n("0900 123 456")).toMatchObject({ valid: true, type: "premium" });
  });
});

describe("Uganda (UCC July 2026)", () => {
  it.each([
    ["+256 772 123456", "MTN"], ["0760123456", "MTN"], ["0789123456", "MTN"], ["0790123456", "MTN"], ["0795123456", "MTN"],
    ["0700123456", "Airtel"], ["0709123456", "Airtel"], ["0730123456", "Airtel"], ["0740123456", "Airtel"], ["0759123456", "Airtel"],
    ["0710123456", "Uganda Telecom"], ["0719123456", "Uganda Telecom"],
    ["0721012345", "Savanna Fibre Limited"], ["0724123456", "Hamilton Telecom Limited"], ["0726123456", "Tangerine Limited"], ["0727123456", "Tangerine Limited"],
    ["0728012345", "Talkio Mobile Limited"], ["0734012345", "Roke Telkom Limited"], ["0737012345", "Blue Crane Communications (U) Limited"], ["0737112345", "Blue Crane Communications (U) Limited"],
  ])("%s -> %s", (num, network) => {
    expect(n(num, "UG")).toMatchObject({ valid: true, country: "UG", type: "mobile", network });
  });
  it.each(["0721112345", "0728112345", "0734112345", "0737212345", "0720123456", "0796123456", "0798123456", "0799123456", "0725123456"])("%s -> not in the UCC plan", (num) => {
    expect(n(num, "UG")).toMatchObject({ valid: false, reason: "prefix_not_allocated" });
  });
  it.each([["0414123456", "Uganda Telecom"], ["0312123456", "MTN"], ["0392123456", "MTN"], ["0200123456", "Airtel"], ["0205012345", "Roke Telkom Limited"], ["0206300123", "Simbanet Uganda Limited"]])("landline %s -> %s", (num, network) => {
    expect(n(num, "UG")).toMatchObject({ valid: true, type: "landline", network });
  });
  it("Uganda numbers are always 9 digits", () => {
    expect(n("+25677212345")).toMatchObject({ valid: false, reason: "too_short" });
    expect(n("+2567721234567")).toMatchObject({ valid: false, reason: "too_long" });
  });
  it("cites the UCC/ITU plan", () => expect(n("0772123456", "UG").source?.plan).toMatch(/Uganda Communications Commission/));
});

describe("Tanzania (TCRA July 2025)", () => {
  it.each([
    ["+255 754 123 456", "Vodacom"], ["0741123456", "Vodacom"], ["0762123456", "Vodacom"], ["0792123456", "Vodacom"],
    ["0652123456", "Yas"], ["0672123456", "Yas"], ["0712123456", "Yas"], ["0773123456", "Yas"],
    ["0682123456", "Airtel"], ["0692123456", "Airtel"], ["0782123456", "Airtel"],
    ["0612123456", "Halotel"], ["0732123456", "TTCL"],
  ])("%s -> %s", (num, network) => {
    expect(n(num, "TZ")).toMatchObject({ valid: true, country: "TZ", type: "mobile", network });
  });
  it("Yas keeps the legal name Honora and a rebrand note", () => {
    const r = n("0715000000", "TZ");
    expect(r.network_operator).toBe("Honora Tanzania PLC");
    expect(r.notes.join(" ")).toMatch(/formerly Tigo/);
  });
  it("062 is allocated to Viettel but not operational", () => expect(n("0622123456", "TZ")).toMatchObject({ valid: false, reason: "range_not_operational", network: "Halotel" }));
  it.each(["0642123456", "0802123456"])("%s -> not allocated/too short", (num) => expect(n(num, "TZ").valid).toBe(false));
  it.each(["0602123456", "0632123456", "0662123456", "0702123456", "0722123456"])("%s -> valid via secondary source only", (num) => {
    expect(n(num, "TZ")).toMatchObject({ valid: true, range_status: "secondary_source" });
  });
  it.each([["0222123456", "TTCL", "Dar es Salaam"], ["0225123456", "Yas", "Dar es Salaam"], ["0272123456", "TTCL", "Arusha, Kilimanjaro, Manyara, Tanga"], ["0242123456", "TTCL", "Zanzibar (Pemba and Unguja)"]])("landline %s", (num, network, region) => {
    expect(n(num, "TZ")).toMatchObject({ valid: true, type: "landline", network, region });
  });
  it.each(["0221123456", "0292123456"])("%s -> PSTN operator digit or area not allocated", (num) => expect(n(num, "TZ")).toMatchObject({ valid: false, reason: "prefix_not_allocated" }));
});

describe("same digits, different country", () => {
  it("0712345678 is Safaricom in KE, Uganda Telecom in UG, Yas in TZ", () => {
    expect(n("0712345678", "KE").network).toBe("Safaricom");
    expect(n("0712345678", "UG").network).toBe("Uganda Telecom");
    expect(n("0712345678", "TZ").network).toBe("Yas");
  });
  it("an explicit country code wins over the default country", () => {
    expect(n("+255712345678", "KE")).toMatchObject({ country: "TZ", network: "Yas" });
    expect(n("256712345678", "KE")).toMatchObject({ country: "UG", network: "Uganda Telecom" });
  });
});

describe("M-PESA Paybill / Till (format only)", () => {
  it("auto: 5-7 digits is a Paybill-or-Till, format only, never a registry claim", () => {
    const r = n("247247");
    expect(r).toMatchObject({ valid: true, type: "paybill_or_till", check: "format_only", clean: "247247", e164: null, country: "KE" });
    expect(r.notes.join(" ")).toMatch(/does not confirm/);
    expect(JSON.stringify(r)).not.toMatch(/registered|verified|exists":/);
  });
  it.each([["522522", "paybill"], ["888880", "paybill"], ["12345", "paybill"], ["5123456", "till"], ["832909", "till"]] as const)("%s as %s", (num, kind) => {
    expect(n(num, "KE", kind)).toMatchObject({ valid: true, type: kind, check: "format_only", clean: num });
  });
  it("spaces in a till are fine", () => expect(n("512 3456", "KE", "till").clean).toBe("5123456"));
  it.each([["1234", "paybill_till_length_5_to_7"], ["12345678", "paybill_till_length_5_to_7"], ["+247247", "paybill_till_must_not_have_prefix"], ["0247247", "paybill_till_must_not_have_prefix"]])("%s -> %s", (num, reason) => {
    expect(n(num, "KE", "paybill")).toMatchObject({ valid: false, reason, check: "format_only" });
  });
  it("kind=phone never treats a short number as a Paybill", () => expect(n("247247", "KE", "phone")).toMatchObject({ valid: false, check: "numbering_plan", reason: "too_short" }));
});

describe("batch", () => {
  it("keeps order and counts valid results", () => {
    const b = normaliseBatch(["0712345678", "nope", "+256772123456", "247247"]);
    expect(b.count).toBe(4);
    expect(b.valid_count).toBe(3);
    expect(b.results.map((r) => r.type)).toEqual(["mobile", "unknown", "mobile", "paybill_or_till"]);
  });
});

describe("plan tables", () => {
  it.each(["KE", "UG", "TZ"] as const)("%s: prefixes are digits, unique, and bounds are sane", (c) => {
    const seen = new Set<string>();
    for (const a of PLANS[c]) {
      expect(a.prefix).toMatch(/^\d+$/);
      expect(seen.has(a.prefix), `${c} duplicate ${a.prefix}`).toBe(false);
      seen.add(a.prefix);
      expect(a.minLength).toBeLessThanOrEqual(a.maxLength);
    }
  });
  it("longest prefix wins", () => {
    expect(lookup("UG", "721012345")?.operator).toBe("Savanna Fibre Limited");
    expect(lookup("UG", "721112345")).toBeUndefined();
  });
});
