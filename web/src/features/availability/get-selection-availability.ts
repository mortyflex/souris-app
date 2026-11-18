import "server-only";

import { MISSING_FUNCTION, callBookingRpc } from "@/features/booking/supabase-rpc";
import { isValidProfileSlug } from "@/features/public-profile/slug";

import { AvailabilityUnavailableError } from "./get-availability";
import { parseSelectionAvailability, type SelectionAvailability } from "./selection";

/** The database answers a read in well under a second; this bounds a stalled network. */
const SELECTION_AVAILABILITY_TIMEOUT_MS = 10_000;

export type SelectionAvailabilityResult =
  | { readonly status: "OK"; readonly availability: SelectionAvailability }
  /** The page does not accept bookings (unknown, draft, paused, offline, lapsed Plus, switch off): the server's `null`. */
  | { readonly status: "UNAVAILABLE" }
  /**
   * The database has no multi-service function: `20261022120000` is not
   * applied there. Decided ONLY from PostgREST's explicit "no such function"
   * answer (PGRST202) — never from a network failure or any other error.
   */
  | { readonly status: "UNSUPPORTED" };

/**
 * The availability of an ordered selection behind a slug, through the ONE
 * website read of the multi-service contract,
 * `online_booking_public_selection_availability(p_slug, p_service_ids, p_date)`
 * (service_role, server-only). `serviceIds = null` asks for the catalogue
 * alone: the database answers INVALID_SELECTION / EMPTY with the page's
 * services and window — the same envelope as every other answer.
 *
 * Never cached. Throws `AvailabilityUnavailableError` when the read fails
 * (configuration, network, server error, an answer it does not understand):
 * a failure is never shown as "no time", nor as an older server.
 */
export async function getSelectionAvailability(
  slug: string,
  serviceIds: readonly string[] | null,
  date: string | null,
): Promise<SelectionAvailabilityResult> {
  if (!isValidProfileSlug(slug)) return { status: "UNAVAILABLE" };

  const result = await callBookingRpc(
    "online_booking_public_selection_availability",
    { p_slug: slug, p_service_ids: serviceIds, p_date: date },
    SELECTION_AVAILABILITY_TIMEOUT_MS,
  );
  if (!result.ok) {
    if (result.status === 404 && result.code === MISSING_FUNCTION) return { status: "UNSUPPORTED" };
    throw new AvailabilityUnavailableError(result.status === undefined ? "network" : `HTTP ${result.status}`);
  }
  if (result.data === null) return { status: "UNAVAILABLE" };
  const availability = parseSelectionAvailability(result.data);
  if (availability === undefined) throw new AvailabilityUnavailableError("unexpected answer");
  return { status: "OK", availability };
}
