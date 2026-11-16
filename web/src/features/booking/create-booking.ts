import "server-only";

import { isValidProfileSlug } from "@/features/public-profile/slug";

import { parseEngineAnswer, type BookingResponse } from "./booking-answer";
import type { BookingRequest } from "./booking-request";
import { callBookingRpc } from "./supabase-rpc";

/**
 * Longest wait for the engine. The engine itself waits at most 3 seconds for
 * the Business lock (BUSY otherwise); this bounds the network around it.
 */
const BOOKING_TIMEOUT_MS = 10_000;

/**
 * Creates ONE booking through the engine's single website entry point,
 * `online_booking_create_booking` (service_role, secret key, server-only).
 *
 * Exactly the fields the engine accepts — a slug, a service id, an instant, a
 * name, a contact and the idempotency key; the Business, the staff member, the
 * duration, the price, the phases and the availability are decided there.
 *
 * Answers the engine's answer, or ERROR when the outcome is UNKNOWN (network,
 * timeout, server error, an answer not understood): the booking may or may
 * not exist, and only a retry with the SAME key can tell — the engine then
 * replays the stored booking instead of creating another.
 */
export async function createBooking(slug: string, request: BookingRequest, idempotencyKey: string): Promise<BookingResponse> {
  if (!isValidProfileSlug(slug)) return { status: "UNAVAILABLE" };

  const result = await callBookingRpc(
    "online_booking_create_booking",
    {
      p_slug: slug,
      p_service_id: request.serviceId,
      p_starts_at: request.startsAt,
      p_first_name: request.firstName,
      p_last_name: request.lastName,
      p_email: request.email,
      p_phone: request.phone,
      p_idempotency_key: idempotencyKey,
    },
    BOOKING_TIMEOUT_MS,
  );
  if (!result.ok) {
    console.error(`booking: creation outcome unknown (${result.status === undefined ? "no answer" : `HTTP ${result.status}`})`);
    return { status: "ERROR" };
  }
  const answer = parseEngineAnswer(result.data);
  if (answer === undefined) {
    console.error("booking: creation outcome unknown (unexpected answer)");
    return { status: "ERROR" };
  }
  return answer;
}
