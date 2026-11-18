/**
 * Booking SEVERAL services at once — the customer's ordered selection, as the
 * website shows and checks it. Pure: imported by the browser and the server.
 *
 * The database is the authority (`supabase/migrations/20261022120000_add_
 * online_booking_multi_service.sql`, ONLINE_BOOKING.md §13): it resolves each
 * id, adds the lengths up, decides the times and fingerprints what the
 * customer is shown. This module only mirrors its shape rules (so a malformed
 * selection is never sent), reads its answers (approved fields only), and
 * words the selection — its count, its combined length and its indicative
 * total, never an invented amount.
 */

import {
  isCivilDate,
  isServiceId,
  parseAvailableSlot,
  parseBookableService,
  serviceToWire,
  slotToWire,
  type AvailableSlot,
  type BookableService,
} from "./availability";
import { formatServicePrice } from "./service-catalog";

/** THE limits of the database (`online_booking_selection_rules`): 8 distinct services, 12 hours in all. */
export const MAX_SELECTED_SERVICES = 8;
export const MAX_SELECTION_MINUTES = 12 * 60;

/** Said when a total cannot be given: a price is 0 (to be confirmed) or unknown. */
export const TOTAL_TO_CONFIRM = "Total à confirmer";

export type SelectionIssue = "EMPTY" | "MALFORMED" | "TOO_MANY" | "DUPLICATE";
const SELECTION_ISSUES: readonly SelectionIssue[] = ["EMPTY", "MALFORMED", "TOO_MANY", "DUPLICATE"];

/**
 * Why these ids cannot form a selection, in the database's order of decision
 * (`online_booking_selection_issue`) — or undefined. Stricter on the id shape
 * than the database (the website's own `isServiceId`), never looser.
 */
export function selectionIssue(ids: unknown): SelectionIssue | undefined {
  if (!Array.isArray(ids) || ids.length === 0) return "EMPTY";
  if (ids.length > MAX_SELECTED_SERVICES) return "TOO_MANY";
  if (!ids.every(isServiceId)) return "MALFORMED";
  return new Set(ids).size === ids.length ? undefined : "DUPLICATE";
}

// ---------------------------------------------------------------------------
// What the customer sees of her selection
// ---------------------------------------------------------------------------
export type SelectionPrice =
  /** Every selected price is known and positive: their sum, indicative. */
  | { readonly kind: "total"; readonly cents: number }
  /** A price is 0 (« Tarif à confirmer ») or unknown: no amount is ever invented. */
  | { readonly kind: "to_confirm" };

export interface SelectionSummary {
  readonly count: number;
  readonly durationMinutes: number;
  readonly price: SelectionPrice;
}

const isPositivePrice = (cents: number | undefined): cents is number =>
  cents !== undefined && Number.isInteger(cents) && cents > 0;

/** The count, the combined length and the indicative total of services, in her order. */
export function summarizeSelection(services: readonly BookableService[]): SelectionSummary {
  const durationMinutes = services.reduce((total, service) => total + service.durationMinutes, 0);
  const known = services.length > 0 && services.every((service) => isPositivePrice(service.priceCents));
  return {
    count: services.length,
    durationMinutes,
    price: known
      ? { kind: "total", cents: services.reduce((total, service) => total + (service.priceCents ?? 0), 0) }
      : { kind: "to_confirm" },
  };
}

/** « 134 € » — or « Total à confirmer ». */
export function formatSelectionTotal(price: SelectionPrice): string {
  return price.kind === "total" ? (formatServicePrice(price.cents) ?? TOTAL_TO_CONFIRM) : TOTAL_TO_CONFIRM;
}

/** « 1 prestation », « 3 prestations » */
export function formatServiceCount(count: number): string {
  return `${count} prestation${count > 1 ? "s" : ""}`;
}

/** A service's price as a line of a summary: the server's price, « Tarif à confirmer », or nothing. */
export function priceLabel(service: BookableService): string | undefined {
  return formatServicePrice(service.priceCents);
}

/** What changed in ONE selected service between two readings of the catalogue. */
export interface ServiceChange {
  readonly id: string;
  /** The name now. */
  readonly name: string;
  readonly previousName?: string;
  readonly duration?: { readonly from: number; readonly to: number };
  /** The price as it was shown, and as it is now (either may be unknown). */
  readonly price?: { readonly from?: number; readonly to?: number };
}

/**
 * The services present in both readings whose name, length or price differ —
 * in the order of `after`. A service only in one of them is not a change (the
 * callers say « no longer offered » for those).
 */
export function selectionChanges(before: readonly BookableService[], after: readonly BookableService[]): readonly ServiceChange[] {
  const earlier = new Map(before.map((service) => [service.id, service]));
  const changes: ServiceChange[] = [];
  for (const now of after) {
    const then = earlier.get(now.id);
    if (then === undefined) continue;
    const renamed = then.name !== now.name;
    const lengthened = then.durationMinutes !== now.durationMinutes;
    const repriced = then.priceCents !== now.priceCents;
    if (!renamed && !lengthened && !repriced) continue;
    changes.push({
      id: now.id,
      name: now.name,
      ...(renamed ? { previousName: then.name } : {}),
      ...(lengthened ? { duration: { from: then.durationMinutes, to: now.durationMinutes } } : {}),
      ...(repriced
        ? {
            price: {
              ...(then.priceCents !== undefined ? { from: then.priceCents } : {}),
              ...(now.priceCents !== undefined ? { to: now.priceCents } : {}),
            },
          }
        : {}),
    });
  }
  return changes;
}

/** A price in a change line: the amount, « Tarif à confirmer », or « non indiqué ». */
export function changedPriceLabel(cents: number | undefined): string {
  return formatServicePrice(cents) ?? "non indiqué";
}

// ---------------------------------------------------------------------------
// The availability of a selection — `online_booking_public_selection_availability`
// ---------------------------------------------------------------------------
export type SelectionStatus =
  | "INVALID_SELECTION"
  | "UNKNOWN_SERVICE"
  | "SELECTION_TOO_LONG"
  | "DOES_NOT_FIT"
  | "CHOOSE_DATE"
  | "OUT_OF_WINDOW"
  | "SLOTS";
const SELECTION_STATUSES: readonly SelectionStatus[] = [
  "INVALID_SELECTION",
  "UNKNOWN_SERVICE",
  "SELECTION_TOO_LONG",
  "DOES_NOT_FIT",
  "CHOOSE_DATE",
  "OUT_OF_WINDOW",
  "SLOTS",
];
/** The statuses that carry the server's reading of the selection. */
const WITH_SELECTION: readonly SelectionStatus[] = ["SELECTION_TOO_LONG", "DOES_NOT_FIT", "CHOOSE_DATE", "OUT_OF_WINDOW", "SLOTS"];

/**
 * The server's reading of the selection: its services as the page offers
 * them, in her order, their combined length, and the fingerprint of what she
 * is shown — sent back with the booking, which answers SELECTION_CHANGED when
 * a name, a length or a price is no longer this one.
 */
export interface SelectionQuote {
  readonly services: readonly BookableService[];
  readonly durationMinutes: number;
  readonly fingerprint: string;
}

export interface SelectionAvailability {
  readonly timeZone: string;
  readonly slotMinutes: number;
  readonly firstDate: string;
  readonly lastDate: string;
  /** The page's bookable services (the catalogue). */
  readonly services: readonly BookableService[];
  readonly status: SelectionStatus;
  /** INVALID_SELECTION only. */
  readonly reason?: SelectionIssue;
  /** UNKNOWN_SERVICE only: the first id that is not a bookable service of this page. */
  readonly serviceId?: string;
  readonly selection?: SelectionQuote;
  /** SELECTION_TOO_LONG only. */
  readonly maxMinutes?: number;
  /** DOES_NOT_FIT only: the longest working interval of the window. */
  readonly longestIntervalMinutes?: number;
  readonly date?: string;
  /** SLOTS only; may be empty. */
  readonly slots: readonly AvailableSlot[];
}

const FINGERPRINT = /^[0-9a-f]{64}$/;
/** Eight services of at most a day each: an upper bound, never a rule (the server's is 12 hours). */
const MAX_REPORTED_MINUTES = MAX_SELECTED_SERVICES * 24 * 60;

export function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isMinutes = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;

function parseQuote(value: unknown): SelectionQuote | undefined {
  if (!isRecord(value) || !Array.isArray(value.services)) return undefined;
  if (value.services.length < 1 || value.services.length > MAX_SELECTED_SERVICES) return undefined;
  const services = value.services.map(parseBookableService);
  if (services.some((service) => service === undefined)) return undefined;
  const list = services as BookableService[];
  if (new Set(list.map((service) => service.id)).size !== list.length) return undefined;
  if (!isMinutes(value.duration_minutes, MAX_REPORTED_MINUTES) || value.duration_minutes < 1) return undefined;
  if (!isFingerprint(value.fingerprint)) return undefined;
  return { services: list, durationMinutes: value.duration_minutes, fingerprint: value.fingerprint };
}

/**
 * Validates the server's answer. Anything incomplete or unexpected is
 * `undefined`: the caller treats it as a failure, never as "no time". Only
 * the approved fields are copied.
 */
export function parseSelectionAvailability(data: unknown): SelectionAvailability | undefined {
  if (!isRecord(data)) return undefined;
  const status = SELECTION_STATUSES.find((candidate) => candidate === data.status);
  const { time_zone: timeZone, slot_minutes: slotMinutes, first_date: firstDate, last_date: lastDate } = data;
  if (status === undefined || typeof timeZone !== "string" || timeZone.length === 0) return undefined;
  if (typeof slotMinutes !== "number" || !Number.isInteger(slotMinutes) || slotMinutes < 1) return undefined;
  if (!isCivilDate(firstDate) || !isCivilDate(lastDate) || lastDate < firstDate) return undefined;
  if (!Array.isArray(data.services)) return undefined;
  const services = data.services.map(parseBookableService);
  if (services.some((service) => service === undefined)) return undefined;

  const base = {
    timeZone,
    slotMinutes,
    firstDate,
    lastDate,
    services: services as BookableService[],
    status,
    slots: [] as AvailableSlot[],
  };

  if (status === "INVALID_SELECTION") {
    const reason = SELECTION_ISSUES.find((candidate) => candidate === data.reason);
    return reason === undefined ? undefined : { ...base, reason };
  }
  if (status === "UNKNOWN_SERVICE") {
    return typeof data.service_id === "string" && data.service_id.length > 0 && data.service_id.length <= 200
      ? { ...base, serviceId: data.service_id }
      : undefined;
  }

  const selection = WITH_SELECTION.includes(status) ? parseQuote(data.selection) : undefined;
  if (selection === undefined) return undefined;

  if (status === "SELECTION_TOO_LONG") {
    return isMinutes(data.max_minutes, MAX_REPORTED_MINUTES) && data.max_minutes > 0
      ? { ...base, selection, maxMinutes: data.max_minutes }
      : undefined;
  }
  if (status === "DOES_NOT_FIT") {
    return isMinutes(data.longest_interval_minutes, 24 * 60)
      ? { ...base, selection, longestIntervalMinutes: data.longest_interval_minutes }
      : undefined;
  }
  if (status === "CHOOSE_DATE") return { ...base, selection };

  if (!isCivilDate(data.date)) return undefined;
  if (status === "OUT_OF_WINDOW") return { ...base, selection, date: data.date };

  if (!Array.isArray(data.slots)) return undefined;
  const slots = data.slots.map(parseAvailableSlot);
  if (slots.some((slot) => slot === undefined)) return undefined;
  return { ...base, selection, date: data.date, slots: slots as AvailableSlot[] };
}

/** The answer in the server's own form again, approved fields only — what the website's endpoint sends. */
export function selectionAvailabilityToWire(availability: SelectionAvailability): Record<string, unknown> {
  const selection = availability.selection;
  return {
    time_zone: availability.timeZone,
    slot_minutes: availability.slotMinutes,
    first_date: availability.firstDate,
    last_date: availability.lastDate,
    services: availability.services.map(serviceToWire),
    status: availability.status,
    ...(availability.reason !== undefined ? { reason: availability.reason } : {}),
    ...(availability.serviceId !== undefined ? { service_id: availability.serviceId } : {}),
    ...(selection !== undefined
      ? {
          selection: {
            services: selection.services.map(serviceToWire),
            duration_minutes: selection.durationMinutes,
            fingerprint: selection.fingerprint,
          },
        }
      : {}),
    ...(availability.maxMinutes !== undefined ? { max_minutes: availability.maxMinutes } : {}),
    ...(availability.longestIntervalMinutes !== undefined ? { longest_interval_minutes: availability.longestIntervalMinutes } : {}),
    ...(availability.date !== undefined ? { date: availability.date } : {}),
    ...(availability.status === "SLOTS" ? { slots: availability.slots.map(slotToWire) } : {}),
  };
}
