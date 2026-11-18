import { toResponseWire, type BookingResponse } from "@/features/booking/booking-answer";
import { createSelectionBooking } from "@/features/booking/create-selection-booking";
import { isBookingFlowEnabled } from "@/features/booking/flow-gate";
import { noStoreJson } from "@/features/booking/json-response";
import {
  clientNetwork,
  isJsonRequest,
  isSameOriginPost,
  MAX_SELECTION_BODY_BYTES,
  readBoundedBody,
  takeRequestQuota,
} from "@/features/booking/request-protection";
import { parseSelectionRequestWire } from "@/features/booking/selection-request";
import { verifyChallenge } from "@/features/booking/turnstile";
import { isValidProfileSlug } from "@/features/public-profile/slug";

const reply = (response: BookingResponse, status: number, headers?: Record<string, string>) =>
  noStoreJson(toResponseWire(response), status, headers);
const REJECTED: BookingResponse = { status: "REJECTED" };

/**
 * POST /api/booking/<slug>/selection — creates ONE appointment holding an
 * ordered selection of 1 to 8 services (ONLINE_BOOKING.md §13.6).
 *
 * Body (JSON, at most 4 KB, exactly these keys): service_ids (the ids in the
 * customer's order), starts_at, selection_fingerprint (as the availability of
 * that selection returned it), first_name, last_name, email, phone,
 * idempotency_key. Header `X-Turnstile-Token`: a single-use Cloudflare
 * Turnstile token — never in the body, so a retry re-sends the same body
 * under the same key with a NEW token.
 *
 * The door of the single-service endpoint, in the same order and with the
 * same counters (a selection is ONE booking): deployment gate, slug, origin,
 * content type, size, request shape and fields, bot challenge (fail closed),
 * request limits (fail closed) — and only then the engine. Nothing the
 * customer typed is ever logged.
 *
 *   200  the engine's answer: BOOKED (+ services, duration_minutes),
 *        SLOT_UNAVAILABLE, UNKNOWN_SERVICE (+ service_id), SELECTION_CHANGED,
 *        SELECTION_TOO_LONG, INVALID_REQUEST + field, BUSY,
 *        IDEMPOTENCY_KEY_REUSED, UNAVAILABLE
 *   400  REJECTED (not a selection request) or INVALID_REQUEST + field
 *   403  REJECTED (another origin) or CHALLENGE_FAILED
 *   404  REJECTED (no booking flow here)
 *   413  REJECTED (too large)        415  REJECTED (not JSON)
 *   429  RATE_LIMITED                503  PROTECTION_UNAVAILABLE
 *   502  ERROR — outcome unknown: retry with the SAME key
 */
export async function POST(request: Request, context: RouteContext<"/api/booking/[slug]/selection">): Promise<Response> {
  if (!isBookingFlowEnabled()) return reply(REJECTED, 404);
  const { slug } = await context.params;
  if (!isValidProfileSlug(slug)) return reply(REJECTED, 404);
  if (!isSameOriginPost(request)) return reply(REJECTED, 403);
  if (!isJsonRequest(request)) return reply(REJECTED, 415);

  const body = await readBoundedBody(request, MAX_SELECTION_BODY_BYTES);
  if (!body.ok) return reply(REJECTED, body.reason === "TOO_LARGE" ? 413 : 400);
  let data: unknown;
  try {
    data = JSON.parse(body.text);
  } catch {
    return reply(REJECTED, 400);
  }
  const parsed = parseSelectionRequestWire(data);
  if (!parsed.ok) {
    return parsed.malformed ? reply(REJECTED, 400) : reply({ status: "INVALID_REQUEST", field: parsed.field }, 400);
  }

  const challenge = await verifyChallenge(request);
  if (challenge === "FAILED") return reply({ status: "CHALLENGE_FAILED" }, 403);
  if (challenge === "UNAVAILABLE") return reply({ status: "PROTECTION_UNAVAILABLE" }, 503);

  const quota = await takeRequestQuota("booking", {
    network: clientNetwork(request),
    page: slug,
    email: parsed.request.email,
  });
  if (quota === "LIMITED") return reply({ status: "RATE_LIMITED" }, 429, { "Retry-After": "600" });
  if (quota === "UNAVAILABLE") return reply({ status: "PROTECTION_UNAVAILABLE" }, 503);

  const answer = await createSelectionBooking(slug, parsed.request, parsed.idempotencyKey);
  return reply(answer, answer.status === "ERROR" ? 502 : 200);
}
