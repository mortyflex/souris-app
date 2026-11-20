import { parsePublicLocation, type PublicLocation } from "@/features/location/public-location";

/**
 * The public profile of a professional, as the website may show it.
 *
 * This is the whole public contract: the server function
 * `online_booking_public_profile` returns these fields and nothing else — no
 * business identifier, no owner, no subscription or financial fact.
 */
export interface PublicProfile {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly phone?: string;
  readonly email?: string;
  /**
   * Where she receives her clients, at the level SHE chose (migration
   * 20261020120000): a complete address, a city, or nothing. Absent for a
   * hidden location, one never chosen, and a database that predates the
   * contract — the legacy free-text `address` of the answer is never read.
   */
  readonly location?: PublicLocation;
  /** Object paths in the public branding bucket; turned into URLs by `publicMediaUrl`. */
  readonly logoPath?: string;
  readonly coverPath?: string;
  readonly timeZone: string;
  /** Whether the professional accepts online bookings. The booking flow itself is not built yet. */
  readonly bookingEnabled: boolean;
}

const MEDIA_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(logo|cover)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mediaPath(value: unknown, kind: "logo" | "cover"): string | undefined {
  const path = text(value);
  return path !== undefined && MEDIA_PATH_PATTERN.test(path) && path.includes(`/${kind}/`)
    ? path
    : undefined;
}

/**
 * Validates the server answer. `null` (no page online at this address) and
 * anything that is not a well-formed profile both read as "no profile": the
 * page then answers 404 rather than rendering something half-known. Only the
 * approved fields are copied — an unexpected extra field never reaches a page.
 *
 * The location is the `location` key alone, validated strictly
 * (`parsePublicLocation`). The `address` key — the complete address again
 * for websites deployed before the location contract, and the RAW legacy text
 * on a database that predates it — is NOT read: a page never shows a place its
 * professional did not explicitly publish.
 */
export function parsePublicProfile(data: unknown): PublicProfile | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const slug = text(row.slug);
  const name = text(row.name);
  if (slug === undefined || name === undefined) return null;

  const description = text(row.description);
  const phone = text(row.phone);
  const email = text(row.email);
  const location = parsePublicLocation(row.location);
  const logoPath = mediaPath(row.logo_path, "logo");
  const coverPath = mediaPath(row.cover_path, "cover");

  return {
    slug,
    name,
    timeZone: text(row.time_zone) ?? "Europe/Paris",
    bookingEnabled: row.booking_enabled === true,
    ...(description !== undefined ? { description } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(logoPath !== undefined ? { logoPath } : {}),
    ...(coverPath !== undefined ? { coverPath } : {}),
  };
}

export const PUBLIC_MEDIA_BUCKET = "business-public-media";

/** The public URL of a branding image, or undefined when the project URL is not configured. */
export function publicMediaUrl(supabaseUrl: string | undefined, path: string): string | undefined {
  if (!supabaseUrl || !MEDIA_PATH_PATTERN.test(path)) return undefined;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${path}`;
}
