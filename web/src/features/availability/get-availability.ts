import "server-only";

import { publicEnv } from "@/lib/env/public";
import { MissingServerEnvError, serverEnv } from "@/lib/env/server";
import { isValidProfileSlug } from "@/features/public-profile/slug";

import { parseAvailability, type Availability, type AvailabilityQuery } from "./availability";

export class AvailabilityUnavailableError extends Error {
  constructor(detail: string) {
    // Never the key, the URL or the response body: a status or a short reason only.
    super(`Availability lookup failed: ${detail}`);
    this.name = "AvailabilityUnavailableError";
  }
}

/**
 * The availability behind a slug for one service and one local date, or
 * `null` when the page does not accept bookings (unknown, draft, unpublished,
 * paused, offline): the server answers the same `null` for all of them. A
 * malformed slug never reaches the database; the service and the date were
 * validated by `parseAvailabilityQuery`.
 *
 * Server-only: it calls the ONE availability function of the database with
 * the secret key, which never leaves this module. Never cached: the calendar
 * changes, and the answer is only ever a snapshot — never a guarantee.
 *
 * Throws when the lookup fails (configuration, network, server error, an
 * answer it does not understand): a failure is never shown as "no slot".
 */
export async function getAvailability(slug: string, query: AvailabilityQuery): Promise<Availability | null> {
  if (!isValidProfileSlug(slug)) return null;

  const supabaseUrl = publicEnv.supabaseUrl;
  if (!supabaseUrl) throw new MissingServerEnvError("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = serverEnv.supabaseSecretKey();

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/online_booking_public_availability`, {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_slug: slug,
        p_service_id: query.serviceId ?? null,
        p_date: query.date ?? null,
      }),
      cache: "no-store",
    });
  } catch {
    throw new AvailabilityUnavailableError("network");
  }
  if (!response.ok) throw new AvailabilityUnavailableError(`HTTP ${response.status}`);

  const data: unknown = await response.json();
  if (data === null) return null;
  const availability = parseAvailability(data);
  if (availability === undefined) throw new AvailabilityUnavailableError("unexpected answer");
  return availability;
}
