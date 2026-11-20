/**
 * Where a professional receives her clients, as her page may say it.
 *
 * This is the whole public contract of a location: the server function
 * `online_booking_public_location` (migration 20261020120000) decides what
 * leaves the database, from the level the professional chose —
 *
 *   FULL_ADDRESS   street, postal code, city, and a plain-text destination
 *   CITY_ONLY      the city — nothing else
 *   hidden / never chosen   no location at all (`null`)
 *
 * — and this module only accepts EXACTLY those two shapes. Anything else — a
 * missing or extra key, a value that is not a plain single line, a level it
 * does not know, a database that predates the contract — reads as "no
 * location": the page then shows none. It never falls back to the legacy
 * free-text `address` of the profile, and it never repairs a shape.
 */
export type PublicLocation =
  | {
      readonly visibility: "FULL_ADDRESS";
      readonly street: string;
      readonly postalCode: string;
      readonly city: string;
      /** Plain text built by the server (« street, postal code city ») — never a URL, never coordinates. */
      readonly directionsDestination: string;
    }
  | { readonly visibility: "CITY_ONLY"; readonly city: string };

/** The server's own limits (online_booking_location_issue). */
const STREET_MAX = 200;
const CITY_MAX = 100;
/** street + « , » + postal code + « » + city. */
const DESTINATION_MAX = STREET_MAX + 2 + 10 + 1 + CITY_MAX;
/** 3 to 10 letters or digits, single inner spaces or hyphens: 69001, 1000, SW1A 1AA, 12345-678. */
const POSTAL_CODE = /^(?=.{3,10}$)[0-9A-Za-z]+([ -][0-9A-Za-z]+)*$/;

// The server's plain-text rule (online_booking_is_plain_text): something
// visible, no control character, no line or paragraph separator, no
// bidirectional override.
const VISIBLE_CHARACTER = /[^\s\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]/;
const REFUSED_CHARACTER = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;

/** A value exactly as the server stores one: a trimmed, plain, single line of 1 to `max` characters. */
export function isPlainLine(value: unknown, max: number): value is string {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= max && VISIBLE_CHARACTER.test(value) && !REFUSED_CHARACTER.test(value);
}

function hasExactly(row: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(row);
  return present.length === keys.length && keys.every((key) => key in row);
}

/**
 * Validates the `location` of a public profile answer. `undefined` — "this
 * page shows no location" — for `null`, for an absent key and for anything
 * that is not exactly one of the two public shapes.
 */
export function parsePublicLocation(value: unknown): PublicLocation | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;

  if (row.visibility === "FULL_ADDRESS") {
    if (!hasExactly(row, ["visibility", "street", "postal_code", "city", "directions_destination"])) return undefined;
    const { street, postal_code: postalCode, city, directions_destination: directionsDestination } = row;
    if (!isPlainLine(street, STREET_MAX) || !isPlainLine(city, CITY_MAX)) return undefined;
    if (typeof postalCode !== "string" || !POSTAL_CODE.test(postalCode)) return undefined;
    if (!isPlainLine(directionsDestination, DESTINATION_MAX)) return undefined;
    return { visibility: "FULL_ADDRESS", street, postalCode, city, directionsDestination };
  }

  if (row.visibility === "CITY_ONLY") {
    // A city-only answer that carries anything else is not a city-only answer.
    if (!hasExactly(row, ["visibility", "city"])) return undefined;
    return isPlainLine(row.city, CITY_MAX) ? { visibility: "CITY_ONLY", city: row.city } : undefined;
  }

  return undefined;
}

/** The address of a complete location, as it is written on two lines. */
export function addressLines(location: Extract<PublicLocation, { visibility: "FULL_ADDRESS" }>): readonly [string, string] {
  return [location.street, `${location.postalCode} ${location.city}`];
}
