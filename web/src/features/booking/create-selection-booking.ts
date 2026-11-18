import "server-only";

import { isValidProfileSlug } from "@/features/public-profile/slug";

import { parseEngineAnswer, type BookingResponse } from "./booking-answer";
import type { SelectionBookingRequest } from "./selection-request";
import { MISSING_FUNCTION, SERIALIZATION_FAILURE, callBookingRpc } from "./supabase-rpc";

/**
 * The engine's share of one request, all attempts together: the engine waits
 * at most 3 seconds for the Business lock (BUSY otherwise). Challenge 3 s +
 * limits 5 s + this 10 s = 18 s, inside the browser's 20 s.
 */
const ENGINE_BUDGET_MS = 10_000;
/** Below this, another attempt could not answer in time: the customer retries instead. */
const MIN_ATTEMPT_MS = 1_500;
const MAX_ATTEMPTS = 3;

/**
 * Creates ONE appointment for an ordered selection through the multi-service
 * engine's single website entry point, `online_booking_create_selection_booking`
 * (service_role, secret key, server-only) — never one appointment per service.
 *
 * Exactly the fields the engine accepts: a slug, the ids in her order, a
 * start, the fingerprint of what she was shown, a name, a contact and the
 * idempotency key. Names, lengths, prices and phases are the server's.
 *
 *   * 40001 (serialization_failure: the catalogue changed while the phases
 *     were copied) means the engine's transaction was ROLLED BACK — nothing
 *     was written. The very same request is sent again under the very same
 *     key, while the budget allows; then BUSY: nothing is booked, and the
 *     customer's retry sends the same request again (never a new key).
 *   * PGRST202 — the function does not exist: the multi-service migration is
 *     not applied there. Nothing ran: UNAVAILABLE.
 *   * Anything else that is not an answer (network, timeout, another server
 *     error, an answer not understood) is ERROR: the outcome is UNKNOWN, and
 *     only a retry with the SAME key can tell — the engine then replays the
 *     stored booking instead of creating another.
 */
export async function createSelectionBooking(
  slug: string,
  request: SelectionBookingRequest,
  idempotencyKey: string,
): Promise<BookingResponse> {
  if (!isValidProfileSlug(slug)) return { status: "UNAVAILABLE" };

  const body = {
    p_slug: slug,
    p_service_ids: [...request.serviceIds],
    p_starts_at: request.startsAt,
    p_first_name: request.firstName,
    p_last_name: request.lastName,
    p_email: request.email,
    p_phone: request.phone,
    p_selection_fingerprint: request.fingerprint,
    p_idempotency_key: idempotencyKey,
  };
  const deadline = Date.now() + ENGINE_BUDGET_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadline - Date.now();
    if (attempt > 1 && remaining < MIN_ATTEMPT_MS) break;
    const result = await callBookingRpc("online_booking_create_selection_booking", body, remaining);
    if (result.ok) {
      const answer = parseEngineAnswer(result.data);
      if (answer === undefined) {
        console.error("booking: selection outcome unknown (unexpected answer)");
        return { status: "ERROR" };
      }
      return answer;
    }
    if (result.code === SERIALIZATION_FAILURE) continue;
    if (result.status === 404 && result.code === MISSING_FUNCTION) {
      console.error("booking: the multi-service booking function is missing (migration not applied)");
      return { status: "UNAVAILABLE" };
    }
    console.error(`booking: selection outcome unknown (${result.status === undefined ? "no answer" : `HTTP ${result.status}`})`);
    return { status: "ERROR" };
  }
  // Every attempt was rolled back: nothing is booked; the same request may be sent again.
  console.error("booking: selection rolled back (40001), retry left to the customer");
  return { status: "BUSY" };
}
