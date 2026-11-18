/**
 * What a booking attempt can answer — the engines' answers
 * (`online_booking_create_booking`, ONLINE_BOOKING.md §9.2, and the
 * multi-service `online_booking_create_selection_booking`, §13.6) and the
 * website's own refusals in front of them.
 *
 * ONE wire vocabulary, the engine's: the server validates the engine's JSON
 * with `parseEngineAnswer` and forwards it in the same form; the browser
 * reads the website's answer with `parseResponseWire`. Only approved fields
 * are copied, so nothing unexpected ever reaches a screen.
 *
 * Pure: imported by the browser and by the server.
 */

import { isCivilDate, isServiceId } from "@/features/availability/availability";
import { MAX_SELECTED_SERVICES } from "@/features/availability/selection";

import { ENGINE_FIELDS, isUtcInstant, type EngineField } from "./booking-request";

/** A booked service, as the server confirmed it: its snapshot name and length — never an amount. */
export interface BookedService {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
}

/** A booking the server created, exactly as it confirmed it — ONE appointment. */
export interface ConfirmedBooking {
  /** Which engine answered: one service (`booking.service`), or a selection (`booking.services`). */
  readonly kind: "single" | "selection";
  /** Random reference of the booking record; it grants nothing. */
  readonly reference: string;
  /** The booked services, in the order they follow each other (one for a single-service booking). */
  readonly services: readonly BookedService[];
  /** The booked length: the sum of the services. */
  readonly durationMinutes: number;
  /** UTC instants `YYYY-MM-DDTHH:MM:SSZ`. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** The start as the professional's clock reads it, in HER time zone. */
  readonly localDate: string;
  readonly localTime: string;
  readonly timeZone: string;
}

export type EngineAnswer =
  | { readonly status: "BOOKED"; readonly booking: ConfirmedBooking }
  | { readonly status: "SLOT_UNAVAILABLE" }
  /** Not a bookable service (any more); the multi-service engine names the first one. */
  | { readonly status: "UNKNOWN_SERVICE"; readonly serviceId?: string }
  | { readonly status: "INVALID_REQUEST"; readonly field: EngineField }
  /** A selected service's name, length or price is not what the customer was shown: nothing was booked. */
  | { readonly status: "SELECTION_CHANGED" }
  /** The selection is longer than 12 hours: nothing was booked. */
  | { readonly status: "SELECTION_TOO_LONG" }
  | { readonly status: "BUSY" }
  | { readonly status: "IDEMPOTENCY_KEY_REUSED" }
  /** The engine's NULL: nothing can be booked here (switch off, paused, offline…). */
  | { readonly status: "UNAVAILABLE" };

export type GuardAnswer =
  /** Too many requests: the engine was not called. */
  | { readonly status: "RATE_LIMITED" }
  /** The request protection is not available (configuration): the engine was not called — fail closed. */
  | { readonly status: "PROTECTION_UNAVAILABLE" }
  /** No valid bot-challenge token (missing, invalid, expired or already used): the engine was not called. */
  | { readonly status: "CHALLENGE_FAILED" }
  /** Refused at the door (flow closed, foreign origin, malformed): the engine was not called. */
  | { readonly status: "REJECTED" }
  /** The outcome is UNKNOWN (network, timeout, server error): the same key must be retried. */
  | { readonly status: "ERROR" };

export type BookingResponse = EngineAnswer | GuardAnswer;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An IANA time zone this runtime can format in. */
export function isUsableTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const isMinutes = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;

function parseBookedService(value: unknown): BookedService | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, duration_minutes: minutes } = value;
  if (!isServiceId(id) || typeof name !== "string" || name.trim().length === 0) return undefined;
  if (!isMinutes(minutes, 24 * 60)) return undefined;
  return { id, name: name.trim(), durationMinutes: minutes };
}

/**
 * The booking of either engine: `service` (one service) or `services` +
 * `duration_minutes` (a selection) — exactly one of the two shapes.
 */
function parseBooking(value: unknown): ConfirmedBooking | undefined {
  if (!isRecord(value)) return undefined;
  const { reference, starts_at: startsAt, ends_at: endsAt, local_date: localDate, local_time: localTime, time_zone: timeZone } = value;
  if (typeof reference !== "string" || !UUID.test(reference)) return undefined;
  if (!isUtcInstant(startsAt) || !isUtcInstant(endsAt) || endsAt <= startsAt) return undefined;
  if (!isCivilDate(localDate) || typeof localTime !== "string" || !LOCAL_TIME.test(localTime)) return undefined;
  if (!isUsableTimeZone(timeZone)) return undefined;
  const when = { reference, startsAt, endsAt, localDate, localTime, timeZone };

  if ("service" in value && !("services" in value)) {
    const service = parseBookedService(value.service);
    return service === undefined ? undefined : { kind: "single", ...when, services: [service], durationMinutes: service.durationMinutes };
  }
  if ("services" in value && !("service" in value) && Array.isArray(value.services)) {
    if (value.services.length < 1 || value.services.length > MAX_SELECTED_SERVICES) return undefined;
    const services = value.services.map(parseBookedService);
    if (services.some((service) => service === undefined)) return undefined;
    if (!isMinutes(value.duration_minutes, MAX_SELECTED_SERVICES * 24 * 60)) return undefined;
    return { kind: "selection", ...when, services: services as BookedService[], durationMinutes: value.duration_minutes };
  }
  return undefined;
}

const SIMPLE_ENGINE_STATUSES = ["SLOT_UNAVAILABLE", "BUSY", "IDEMPOTENCY_KEY_REUSED", "SELECTION_CHANGED", "SELECTION_TOO_LONG"] as const;
const GUARD_STATUSES = ["RATE_LIMITED", "PROTECTION_UNAVAILABLE", "CHALLENGE_FAILED", "REJECTED", "ERROR"] as const;

function parseEngineObject(data: Record<string, unknown>): EngineAnswer | undefined {
  if (data.status === "BOOKED") {
    const booking = parseBooking(data.booking);
    return booking === undefined ? undefined : { status: "BOOKED", booking };
  }
  if (data.status === "INVALID_REQUEST") {
    const field = ENGINE_FIELDS.find((candidate) => candidate === data.field);
    return field === undefined ? undefined : { status: "INVALID_REQUEST", field };
  }
  if (data.status === "UNKNOWN_SERVICE") {
    // The multi-service engine names the service (or answers null); the single-service one does not.
    return isServiceId(data.service_id) ? { status: "UNKNOWN_SERVICE", serviceId: data.service_id } : { status: "UNKNOWN_SERVICE" };
  }
  const simple = SIMPLE_ENGINE_STATUSES.find((candidate) => candidate === data.status);
  return simple === undefined ? undefined : { status: simple };
}

/**
 * The engine's answer as PostgREST returns it. `null` — nothing can be booked
 * here — is UNAVAILABLE. Anything not understood is `undefined`: the caller
 * treats it as an UNKNOWN outcome, never as a success or a refusal.
 */
export function parseEngineAnswer(data: unknown): EngineAnswer | undefined {
  if (data === null) return { status: "UNAVAILABLE" };
  return isRecord(data) ? parseEngineObject(data) : undefined;
}

/** What the website's endpoint sends: the engine's form, `UNAVAILABLE` spelled out. */
export function toResponseWire(response: BookingResponse): Record<string, unknown> {
  switch (response.status) {
    case "BOOKED": {
      const { booking } = response;
      const wire = (service: BookedService) => ({ id: service.id, name: service.name, duration_minutes: service.durationMinutes });
      return {
        status: "BOOKED",
        booking: {
          reference: booking.reference,
          // Each engine's own shape, so the single-service endpoint answers exactly as it always did.
          ...(booking.kind === "single"
            ? { service: wire(booking.services[0]!) }
            : { services: booking.services.map(wire), duration_minutes: booking.durationMinutes }),
          starts_at: booking.startsAt,
          ends_at: booking.endsAt,
          local_date: booking.localDate,
          local_time: booking.localTime,
          time_zone: booking.timeZone,
        },
      };
    }
    case "INVALID_REQUEST":
      return { status: "INVALID_REQUEST", field: response.field };
    case "UNKNOWN_SERVICE":
      return response.serviceId === undefined ? { status: "UNKNOWN_SERVICE" } : { status: "UNKNOWN_SERVICE", service_id: response.serviceId };
    default:
      return { status: response.status };
  }
}

/** The browser's reading of the website's answer. `undefined` = not understood = unknown outcome. */
export function parseResponseWire(data: unknown): BookingResponse | undefined {
  if (!isRecord(data)) return undefined;
  if (data.status === "UNAVAILABLE") return { status: "UNAVAILABLE" };
  const guard = GUARD_STATUSES.find((candidate) => candidate === data.status);
  if (guard !== undefined) return { status: guard };
  return parseEngineObject(data);
}
