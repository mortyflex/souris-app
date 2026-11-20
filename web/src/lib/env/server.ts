import "server-only";

/**
 * Server-only environment contract.
 *
 * `server-only` makes the build fail if a Client Component ever imports this
 * module, so a secret can never reach the browser bundle. Secrets are read
 * lazily, at the moment a server module needs one, never at import time.
 *
 * Callers: the public profile lookup
 * (src/features/public-profile/get-public-profile.ts), the availability
 * lookup and its preview switch (src/features/availability/), the booking
 * flow gate, booking creation, its request protection and its bot challenge
 * (src/features/booking/), the map snapshot signature
 * (src/features/location/map-snapshot.ts).
 */

export class MissingServerEnvError extends Error {
  constructor(name: string) {
    // The variable NAME only: a value must never appear in a message or a log.
    super(`Missing server environment variable: ${name}`);
    this.name = "MissingServerEnvError";
  }
}

export class InvalidServerEnvError extends Error {
  constructor(name: string, rule: string) {
    // The variable NAME and the rule it breaks: never its value.
    super(`Invalid server environment variable: ${name} (${rule})`);
    this.name = "InvalidServerEnvError";
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingServerEnvError(name);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Shortest accepted HMAC key of the request counters: 32 characters (≥ 128 bits of a random string). */
const MIN_REQUEST_LIMIT_SECRET_LENGTH = 32;

export const serverEnv = {
  /** Supabase SECRET key (sb_secret_…) of the server-side lookups. Never prefixed NEXT_PUBLIC_. */
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  /**
   * Development / Staging only: `enabled` shows the read-only availability
   * preview on /r/<slug>/reserver. Absent or anything else: the route keeps its
   * « pas encore disponible » notice. Never set on the production website.
   */
  availabilityPreviewSwitch: () => process.env.ONLINE_BOOKING_AVAILABILITY_PREVIEW?.trim() === "enabled",
  /**
   * Development / Staging only: `enabled` opens the public booking flow on
   * /r/<slug>/reserver and its two endpoints under /api/booking/<slug>.
   * Absent or anything else: the route keeps its notice and both endpoints
   * answer 404. Never set on the production website (and ignored there).
   */
  bookingFlowSwitch: () => process.env.ONLINE_BOOKING_WEB_BOOKING?.trim() === "enabled",
  /**
   * HMAC key that turns an IP address, an email or a slug into an opaque
   * request-counter key (src/features/booking/request-protection.ts). Random,
   * at least 32 characters, distinct per environment. Absent or too short:
   * the booking endpoints refuse every request (fail closed).
   */
  requestLimitSecret: () => {
    const value = required("ONLINE_BOOKING_REQUEST_LIMIT_SECRET");
    if (value.length < MIN_REQUEST_LIMIT_SECRET_LENGTH) {
      throw new InvalidServerEnvError("ONLINE_BOOKING_REQUEST_LIMIT_SECRET", `at least ${MIN_REQUEST_LIMIT_SECRET_LENGTH} characters`);
    }
    return value;
  },
  /**
   * Cloudflare Turnstile widget of the booking flow
   * (src/features/booking/turnstile.ts). The site key is public by nature: the
   * server hands it to the page. Cloudflare's TEST keys are honoured on a
   * local site only. Absent: the booking flow refuses every booking (fail
   * closed).
   */
  turnstileSiteKey: () => optional("TURNSTILE_SITE_KEY"),
  /** The widget's SECRET key: Siteverify only, from server-only code. Never prefixed NEXT_PUBLIC_. */
  turnstileSecretKey: () => optional("TURNSTILE_SECRET_KEY"),
  /**
   * Apple Maps Web Snapshots (src/features/location/map-snapshot.ts): the map
   * image of a published location. Three values of ONE Apple Developer
   * account — the Team ID, the Key ID of a key with the MapKit JS service, and
   * that key's private key (the .p8 file's text). All three, or no snapshot:
   * absent, mixed or malformed, the page shows its own artwork instead (the
   * address and the directions keep working). Optional by design — never
   * required by a page.
   */
  appleMapsTeamId: () => optional("APPLE_MAPS_TEAM_ID"),
  appleMapsKeyId: () => optional("APPLE_MAPS_KEY_ID"),
  /** The SECRET signing key (PEM). Server-only: never prefixed NEXT_PUBLIC_, never logged, never sent to a page. */
  appleMapsPrivateKey: () => optional("APPLE_MAPS_PRIVATE_KEY"),
} as const;
