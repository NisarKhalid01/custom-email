/**
 * Form address -> Shopify MailingAddressInput.
 *
 * SERVER ONLY.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The form submits DISPLAY NAMES. Its country select is built from Shopify's
 * `all_country_option_tags`, whose option values are names ("United States"),
 * and its province list is populated from that tag's `data-provinces`, which on
 * this store yields names too — verified against stored rows:
 *
 *     country = "United States"   state = "District of Columbia"
 *
 * `MailingAddressInput` on API 2025-01 takes `countryCode` (a CountryCode enum
 * value) and `provinceCode`. There is no `country` / `province` string field to
 * fall back on, so an unmapped name is simply dropped by Shopify — silently
 * producing a draft order with no country, which then cannot be rated for
 * shipping. Hence mapping here rather than hoping.
 *
 * ---------------------------------------------------------------------------
 * WHAT HAPPENS WHEN A NAME DOES NOT MAP
 * ---------------------------------------------------------------------------
 * The field is OMITTED and the caller is told. Never guessed. A draft order with
 * a missing province is fixable by a human in ten seconds; one with a plausible
 * but wrong province is not, because nobody knows to look.
 */

/**
 * Country name -> ISO 3166-1 alpha-2, built from the runtime's own ICU data.
 *
 * Derived rather than hardcoded: a 250-row table would be one more thing to
 * maintain and to get subtly wrong, and Node already ships the mapping. Built
 * once on first use — 676 lookups, then cached.
 */
let COUNTRY_TO_CODE = null;

function countryIndex() {
  if (COUNTRY_TO_CODE) return COUNTRY_TO_CODE;
  const map = new Map();
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        let label;
        try {
          label = names.of(code);
        } catch {
          continue;
        }
        // Unknown codes come back unchanged; only real regions differ.
        if (label && label !== code) map.set(norm(label), code);
      }
    }
  } catch {
    // No ICU data — every country then falls back to the alias table below.
  }

  // Names Shopify/the theme use that ICU spells differently.
  const aliases = {
    "united states": "US",
    "united states of america": "US",
    usa: "US",
    "united kingdom": "GB",
    "great britain": "GB",
    uk: "GB",
    "south korea": "KR",
    "north korea": "KP",
    russia: "RU",
    vietnam: "VN",
    laos: "LA",
    syria: "SY",
    iran: "IR",
    taiwan: "TW",
    macedonia: "MK",
    "czech republic": "CZ",
    "ivory coast": "CI",
    "cape verde": "CV",
    "east timor": "TL",
    swaziland: "SZ",
  };
  for (const [name, code] of Object.entries(aliases)) map.set(name, code);

  COUNTRY_TO_CODE = map;
  return map;
}

/**
 * Province name -> code, for the two countries this store actually ships to in
 * volume. Shopify only enforces provinceCode for countries that have them; for
 * everywhere else it is optional and we omit it rather than invent one.
 */
const US_PROVINCES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "puerto rico": "PR", "virgin islands": "VI", guam: "GU",
  "american samoa": "AS", "northern mariana islands": "MP",
  "armed forces americas": "AA", "armed forces europe": "AE",
  "armed forces pacific": "AP",
};

const CA_PROVINCES = {
  alberta: "AB", "british columbia": "BC", manitoba: "MB",
  "new brunswick": "NB", "newfoundland and labrador": "NL",
  "northwest territories": "NT", "nova scotia": "NS", nunavut: "NU",
  ontario: "ON", "prince edward island": "PE", quebec: "QC",
  saskatchewan: "SK", yukon: "YT",
};

function norm(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Already a code? Accept it as-is rather than failing to find it by name. */
function looksLikeCode(value, len = 2) {
  const v = String(value ?? "").trim();
  return v.length === len && /^[A-Za-z]+$/.test(v) && v === v.toUpperCase();
}

export function toCountryCode(country) {
  if (!country) return null;
  if (looksLikeCode(country)) return String(country).trim().toUpperCase();
  return countryIndex().get(norm(country)) ?? null;
}

export function toProvinceCode(province, countryCode) {
  if (!province) return null;
  if (looksLikeCode(province)) return String(province).trim().toUpperCase();
  const key = norm(province);
  if (countryCode === "US") return US_PROVINCES[key] ?? null;
  if (countryCode === "CA") return CA_PROVINCES[key] ?? null;
  // Other countries: Shopify does not require a province code, and guessing one
  // from a free-text name is how addresses end up quietly wrong.
  return null;
}

/**
 * Build the shippingAddress for draftOrderCreate.
 *
 * @returns {{address: object|null, warnings: string[]}}
 *   `warnings` names every field that could not be mapped, so the caller can
 *   report it instead of the merchant discovering a half-built address later.
 */
export function buildShippingAddress(payload, { name } = {}) {
  const warnings = [];
  const p = payload ?? {};

  const countryCode = toCountryCode(p.country);
  if (p.country && !countryCode) {
    warnings.push(`country "${p.country}" could not be mapped to a country code`);
  }

  const provinceCode = toProvinceCode(p.state, countryCode);
  if (p.state && !provinceCode && (countryCode === "US" || countryCode === "CA")) {
    warnings.push(`state "${p.state}" could not be mapped to a province code`);
  }

  // Shopify wants first/last separately; the form collects one "Your Name".
  // Split on the LAST space so "Mary Anne Smith" keeps "Mary Anne" together.
  const full = String(name ?? p.name ?? "").trim();
  const cut = full.lastIndexOf(" ");
  const firstName = cut === -1 ? full : full.slice(0, cut);
  const lastName = cut === -1 ? "" : full.slice(cut + 1);

  const address = {
    address1: p.street || null,
    address2: p.apt || null,
    city: p.city || null,
    company: p.company || null,
    zip: p.zip || null,
    phone: p.phone || null,
    firstName: firstName || null,
    lastName: lastName || null,
    ...(countryCode ? { countryCode } : {}),
    ...(provinceCode ? { provinceCode } : {}),
  };

  // Nothing worth sending? Say so rather than attaching an empty object.
  const hasAny = Object.values(address).some((v) => v !== null && v !== "");
  return { address: hasAny ? address : null, warnings };
}
