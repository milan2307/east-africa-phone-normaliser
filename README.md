# East Africa Phone & Paybill Normaliser

Clean up and classify **Kenyan (+254), Ugandan (+256) and Tanzanian (+255)** phone numbers, and format-check
**M-PESA Paybill and Till** numbers. For agents, CRMs, KYC forms and payment flows that receive numbers typed
every possible way (`0712 345 678`, `254712345678`, `+254 (0)712-345-678`, `712345678`).

Pay per call over [x402](https://x402.org): **$0.002 per number**, USDC on Base. Failed calls are free.

Live: **https://mpesa-kra-parser.vercel.app/v1/phone/normalise** (mounted in the
[kenya-agent-tools](https://github.com/milan2307/kenya-agent-tools) deployment). This repo is the standalone source
(library + its own x402 server + an Apify Actor).

## What you get

```json
GET /v1/normalise?number=0712%20345%20678
{
  "input": "0712 345 678",
  "valid": true,
  "country": "KE",
  "type": "mobile",
  "e164": "+254712345678",
  "national": "0712345678",
  "display": "+254 712 345 678",
  "clean": "254712345678",
  "network": "Safaricom",
  "network_operator": "Safaricom PLC",
  "range_status": "operational",
  "region": null,
  "check": "numbering_plan",
  "reason": null,
  "notes": ["Network is the operator this number range is allocated to in the official plan. The number may have been ported to another operator; this is not a live registry lookup."],
  "source": { "plan": "Communications Authority of Kenya, Telecommunication Numbering Plan for Kenya, April 2026 ...", "url": "https://www.ca.go.ke/..." }
}
```

- `type`: `mobile`, `landline`, `m2m`, `toll_free`, `premium`, `paybill`, `till`, `paybill_or_till`, `unknown`
- `network`: Safaricom, Airtel, Telkom, Equitel (Finserve), MTN, Uganda Telecom, Vodacom, Yas (formerly Tigo), Halotel (Viettel), TTCL, and the smaller licensees named in each plan
- `reason` when invalid: `prefix_not_allocated`, `too_short`, `too_long`, `range_not_operational`, `test_range_not_issued`, `unsupported_country_code`, `not_digits`, `paybill_till_length_5_to_7`, ...

| Route | Price | Input |
|---|---|---|
| `GET /v1/normalise` | $0.002 | `number` (required), `country` = KE/UG/TZ for numbers without a country code (default KE), `kind` = auto/phone/paybill/till |
| `POST /v1/normalise/batch` | $0.002 x numbers (1 to 100) | `{ "numbers": [...], "country"?: "KE", "kind"?: "auto" }` |

The batch price is set from the request body, so a 37-number batch shows a $0.074 requirement in its 402.
An invalid number is a correct answer (`valid: false`) and is charged; a malformed request is a 400 and is not.

## Sources (official numbering plans)

| Country | Source |
|---|---|
| Kenya | Communications Authority of Kenya, *Telecommunication Numbering Plan for Kenya*, April 2026 (CA/SRM/S&N/NNP/APRIL/2026): https://www.ca.go.ke/sites/default/files/2026-04/Numbering%20Plan%20Kenya%20April%202026.pdf |
| Uganda | Uganda Communications Commission, *National Numbering Plan of Uganda*, notified to the ITU on 13 July 2026: https://www.itu.int/dms_pub/itu-t/oth/02/02/T02020000F10016PDFE.pdf |
| Tanzania | Tanzania Communications Regulatory Authority, *National Numbering and Signalling Point Codes Plans*, July 2025: https://www.tcra.go.tz/tcra-tovuti/2025/mamlaka-website/documents/communication-sector-guidbooks-and-plans/en_1751634705_National_Numbering_and_Signaling_Point_Code_Plans_edition_of_2025_f06646e5f3.pdf |

Brand names: Yas is the brand of Honora Tanzania PLC (formerly Tigo; [Yas privacy policy](https://yas.co.tz/wp-content/uploads/2026/03/Privacy-Policy.pdf),
[The Citizen, 27 Nov 2024](https://www.thecitizen.co.tz/tanzania/business/tigo-tanzania-rebrands-to-yas-in-shift-towards-pan-african-ambitions-4836754)).
Halotel is Viettel Tanzania's brand.

**Secondary source.** A few ranges appear in [Google libphonenumber](https://github.com/google/libphonenumber) 9.0.42
carrier data (updated Oct 2026) but not yet in the regulator's latest published plan: Kenya 0135-0139 (Airtel) and
018x (Safaricom); Tanzania 060/066 (Airtel), 063 (Halotel), 070 (Yas), 072 (Vodacom); Uganda 0732 (Airtel) and 0736
(Hamilton). They come back `valid: true` with `range_status: "secondary_source"` and the libphonenumber link as
`source`, so you can decide. Where the regulator's plan and libphonenumber disagree on the operator, we follow the
regulator; every difference is listed in `test/crosscheck.test.ts`.

## Caveats (please read)

- **Not a live lookup.** `network` is the operator the number **range** is allocated to. Numbers can be ported to
  another operator, and an allocated number may not be in service. No HLR, SIM-registration or KYC lookup is made.
- **Paybill / Till: format check only.** M-PESA business numbers are checked as 5 to 7 digits, no country code, no
  leading 0. Safaricom publishes no public registry, so a `valid: true` Paybill/Till does **not** mean it exists, is
  active, or belongs to anyone in particular. A bare 5-7 digit input in `auto` mode is reported as `paybill_or_till`;
  pass `kind=paybill` or `kind=till` if you know which. Uganda and Tanzania merchant codes are not supported.
- **Numbers without a country code** are read as `country` (default KE). `0712345678` is Safaricom in Kenya, Uganda
  Telecom in Uganda and Yas in Tanzania.
- Kenya landline area codes keep the plan's per-area minimum lengths (7 to 9 digits).

## Run it

```sh
npm install
npm test                      # 274 tests: plans, formats, cross-check vs libphonenumber, x402 402/pay/settle flows
X402_PAY_TO=0xYourBaseAddress npm start   # Base Sepolia + public x402.org facilitator by default
```

Production (Vercel): `X402_FACILITATOR=cdp`, `X402_NETWORK=eip155:8453`, `X402_PAY_TO`, `CDP_API_KEY_ID`,
`CDP_API_KEY_SECRET` (see `.env.example`). Production refuses to start on testnet settings.

## Apify Actor (prepared, not published)

`apify/` is a ready Actor: input a list of numbers, get one dataset row per number, charged per row with a
`number-normalised` pay-per-event (proposed $0.002, see `apify/.actor/pay_per_event.proposed.json`). It runs locally:

```sh
cd apify && npm install && npm run build
mkdir -p storage/key_value_stores/default && echo '{"numbers":["0712 345 678","+256772123456"]}' > storage/key_value_stores/default/INPUT.json
APIFY_LOCAL_STORAGE_DIR=./storage node dist/src/main.js
```

`apify/src/core` is a copy of `src/core` (`npm run sync-core`); a test fails if they drift.

## License

MIT, LamuLabs. libphonenumber fixture files under `test/fixtures/libphonenumber/` are Apache-2.0 (Google).
