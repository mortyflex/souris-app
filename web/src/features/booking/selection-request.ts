/**
 * A booking request for an ordered SELECTION of services, as the website
 * sends it to its own server and the server to the multi-service engine
 * (`online_booking_create_selection_booking`, ONLINE_BOOKING.md §13.6).
 *
 * The customer supplies ONLY: the service ids in her order, a start (one the
 * availability offered for that very selection), the fingerprint of what she
 * was shown, a name, a contact and an idempotency key. The Business, the
 * staff member, the names, lengths, prices and phases are decided by the
 * server — never read from here; no total is ever sent.
 *
 * The checks mirror the engine's ONE validation rule
 * (`online_booking_selection_request_issue`), in its order, so a malformed
 * request never reaches it; the engine stays the authority.
 *
 * Pure: imported by the browser and by the server.
 */

import { isFingerprint, selectionIssue } from "@/features/availability/selection";

import {
  cleanDetails,
  customerIssues,
  isIdempotencyKey,
  isUtcInstant,
  type EngineField,
} from "./booking-request";

export interface SelectionBookingRequest {
  /** In the customer's order — never sorted. */
  readonly serviceIds: readonly string[];
  /** UTC instant `YYYY-MM-DDTHH:MM:SSZ`, exactly as the availability of THIS selection returned it. */
  readonly startsAt: string;
  /** The server's fingerprint of the selection as it was shown with that start. */
  readonly fingerprint: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

export interface SelectionRequestWire {
  readonly service_ids: readonly string[];
  readonly starts_at: string;
  readonly selection_fingerprint: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
  readonly phone: string;
  readonly idempotency_key: string;
}

const WIRE_KEYS: readonly (keyof SelectionRequestWire)[] = [
  "service_ids",
  "starts_at",
  "selection_fingerprint",
  "first_name",
  "last_name",
  "email",
  "phone",
  "idempotency_key",
];

export function isSelectionRequest(request: object): request is SelectionBookingRequest {
  return "serviceIds" in request;
}

export function toSelectionRequestWire(request: SelectionBookingRequest, idempotencyKey: string): SelectionRequestWire {
  return {
    service_ids: [...request.serviceIds],
    starts_at: request.startsAt,
    selection_fingerprint: request.fingerprint,
    first_name: request.firstName,
    last_name: request.lastName,
    email: request.email,
    phone: request.phone,
    idempotency_key: idempotencyKey,
  };
}

export type ParsedSelectionRequest =
  | { readonly ok: true; readonly request: SelectionBookingRequest; readonly idempotencyKey: string }
  /** Not a selection booking request at all: wrong type, missing or extra keys. */
  | { readonly ok: false; readonly malformed: true }
  /** One unacceptable field (the engine's name for it). */
  | { readonly ok: false; readonly malformed: false; readonly field: EngineField };

/**
 * Reads a POSTed body: exactly the eight keys — `service_ids` a list of
 * strings, every other one a string; nothing else is accepted, so nothing else
 * can ever be forwarded. Then the field rules in the engine's order.
 */
export function parseSelectionRequestWire(data: unknown): ParsedSelectionRequest {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { ok: false, malformed: true };
  const row = data as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== WIRE_KEYS.length || !WIRE_KEYS.every((key) => key in row)) return { ok: false, malformed: true };
  if (!Array.isArray(row.service_ids) || !row.service_ids.every((id) => typeof id === "string")) return { ok: false, malformed: true };
  if (!WIRE_KEYS.every((key) => key === "service_ids" || typeof row[key] === "string")) return { ok: false, malformed: true };
  const wire = row as unknown as SelectionRequestWire;

  if (!isIdempotencyKey(wire.idempotency_key)) return { ok: false, malformed: false, field: "idempotency_key" };
  if (selectionIssue(wire.service_ids) !== undefined) return { ok: false, malformed: false, field: "service_ids" };
  if (!isFingerprint(wire.selection_fingerprint)) return { ok: false, malformed: false, field: "selection_fingerprint" };
  if (!isUtcInstant(wire.starts_at)) return { ok: false, malformed: false, field: "starts_at" };

  const details = cleanDetails({
    firstName: wire.first_name,
    lastName: wire.last_name,
    email: wire.email,
    phone: wire.phone,
  });
  const issues = customerIssues(details);
  if (issues.firstName) return { ok: false, malformed: false, field: "first_name" };
  if (issues.lastName) return { ok: false, malformed: false, field: "last_name" };
  if (issues.email) return { ok: false, malformed: false, field: "email" };
  if (issues.phone) return { ok: false, malformed: false, field: "phone" };

  return {
    ok: true,
    idempotencyKey: wire.idempotency_key,
    request: {
      serviceIds: [...wire.service_ids],
      startsAt: wire.starts_at,
      fingerprint: wire.selection_fingerprint,
      ...details,
    },
  };
}
