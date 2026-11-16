/**
 * What a booking attempt can answer — the engine's answers
 * (`online_booking_create_booking`, ONLINE_BOOKING.md §9.2) and the website's
 * own refusals in front of it.
 *
 * ONE wire vocabulary, the engine's: the server validates the engine's JSON
 * with `parseEngineAnswer` and forwards it in the same form; the browser
 * reads the website's answer with `parseResponseWire`. Only approved fields
 * are copied, so nothing unexpected ever reaches a screen.
 *
 * Pure: imported by the browser and by the server.
 */

import type { BookableService } from "@/features/availability/availability";
import { isCivilDate, isServiceId } from "@/features/availability/availability";

import { ENGINE_FIELDS, isUtcInstant, type EngineField } from "./booking-request";

/** A booking the server created, exactly as it confirmed it. */
export interface ConfirmedBooking {
  /** Random reference of the booking record; it grants nothing. */
  readonly reference: string;
  readonly service: BookableService;
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
  | { readonly status: "UNKNOWN_SERVICE" }
  | { readonly status: "INVALID_REQUEST"; readonly field: EngineField }
  | { readonly status: "BUSY" }
  | { readonly status: "IDEMPOTENCY_KEY_REUSED" }
  /** The engine's NULL: nothing can be booked here (switch off, paused, offline…). */
  | { readonly status: "UNAVAILABLE" };

export type GuardAnswer =
  /** Too many requests: the engine was not called. */
  | { readonly status: "RATE_LIMITED" }
  /** The request protection is not available (configuration): the engine was not called — fail closed. */
  | { readonly status: "PROTECTION_UNAVAILABLE" }
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

function parseBooking(value: unknown): ConfirmedBooking | undefined {
  if (!isRecord(value) || !isRecord(value.service)) return undefined;
  const { reference, starts_at: startsAt, ends_at: endsAt, local_date: localDate, local_time: localTime, time_zone: timeZone } = value;
  const { id, name, duration_minutes: minutes } = value.service;
  if (typeof reference !== "string" || !UUID.test(reference)) return undefined;
  if (!isServiceId(id) || typeof name !== "string" || name.trim().length === 0) return undefined;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) return undefined;
  if (!isUtcInstant(startsAt) || !isUtcInstant(endsAt) || endsAt <= startsAt) return undefined;
  if (!isCivilDate(localDate) || typeof localTime !== "string" || !LOCAL_TIME.test(localTime)) return undefined;
  if (!isUsableTimeZone(timeZone)) return undefined;
  return {
    reference,
    service: { id, name: name.trim(), durationMinutes: minutes },
    startsAt,
    endsAt,
    localDate,
    localTime,
    timeZone,
  };
}

const SIMPLE_ENGINE_STATUSES = ["SLOT_UNAVAILABLE", "UNKNOWN_SERVICE", "BUSY", "IDEMPOTENCY_KEY_REUSED"] as const;
const GUARD_STATUSES = ["RATE_LIMITED", "PROTECTION_UNAVAILABLE", "REJECTED", "ERROR"] as const;

function parseEngineObject(data: Record<string, unknown>): EngineAnswer | undefined {
  if (data.status === "BOOKED") {
    const booking = parseBooking(data.booking);
    return booking === undefined ? undefined : { status: "BOOKED", booking };
  }
  if (data.status === "INVALID_REQUEST") {
    const field = ENGINE_FIELDS.find((candidate) => candidate === data.field);
    return field === undefined ? undefined : { status: "INVALID_REQUEST", field };
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
      return {
        status: "BOOKED",
        booking: {
          reference: booking.reference,
          service: { id: booking.service.id, name: booking.service.name, duration_minutes: booking.service.durationMinutes },
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
