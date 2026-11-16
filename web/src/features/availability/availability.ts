/**
 * The availability of a professional, as the website may show it.
 *
 * This is the whole public contract of `online_booking_public_availability`:
 * the bookable services (name and duration), the bookable window, and the
 * start times of one service on one local date — no business identifier, no
 * client, no appointment, no price. The server computes everything; the
 * website only validates the answer and presents it.
 *
 * Dates are civil dates of the professional's time zone (`YYYY-MM-DD`) and are
 * formatted as such, never through the server's or the browser's time zone.
 * Start times are UTC instants plus the professional's wall-clock label.
 */

export interface BookableService {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
}

export interface AvailableSlot {
  /** UTC instant, `YYYY-MM-DDTHH:MM:SSZ`: what a future booking would send back. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** « 09:15 » in the professional's time zone. */
  readonly localTime: string;
}

export type AvailabilityStatus = "CHOOSE_SERVICE" | "UNKNOWN_SERVICE" | "CHOOSE_DATE" | "OUT_OF_WINDOW" | "SLOTS";

export interface Availability {
  readonly timeZone: string;
  readonly slotMinutes: number;
  /** First and last local dates that can be offered at all. */
  readonly firstDate: string;
  readonly lastDate: string;
  readonly services: readonly BookableService[];
  readonly status: AvailabilityStatus;
  readonly service?: BookableService;
  readonly date?: string;
  /** Only for `SLOTS`; may be empty. */
  readonly slots: readonly AvailableSlot[];
}

const STATUSES: readonly AvailabilityStatus[] = ["CHOOSE_SERVICE", "UNKNOWN_SERVICE", "CHOOSE_DATE", "OUT_OF_WINDOW", "SLOTS"];
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** The shape of a catalog service id: a device UUID or a deterministic imported id. */
const SERVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
/** More than the 31 dates of a 30-day horizon, never an unbounded list. */
const MAX_WINDOW_DATES = 62;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A real calendar date in `YYYY-MM-DD`. */
export function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !CIVIL_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isServiceId(value: unknown): value is string {
  return typeof value === "string" && SERVICE_ID.test(value);
}

function parseService(value: unknown): BookableService | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, duration_minutes: minutes } = value;
  if (!isServiceId(id) || typeof name !== "string" || name.trim().length === 0) return undefined;
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) return undefined;
  return { id, name: name.trim(), durationMinutes: minutes };
}

function parseSlot(value: unknown): AvailableSlot | undefined {
  if (!isRecord(value)) return undefined;
  const { starts_at: startsAt, ends_at: endsAt, local_time: localTime } = value;
  if (typeof startsAt !== "string" || !UTC_INSTANT.test(startsAt)) return undefined;
  if (typeof endsAt !== "string" || !UTC_INSTANT.test(endsAt) || endsAt <= startsAt) return undefined;
  if (typeof localTime !== "string" || !LOCAL_TIME.test(localTime)) return undefined;
  return { startsAt, endsAt, localTime };
}

/**
 * Validates the server answer. Anything that is not a complete, well-formed
 * availability reads as `undefined`: the caller treats it as a failure, never
 * as "no slot". Only the approved fields are copied.
 */
export function parseAvailability(data: unknown): Availability | undefined {
  if (!isRecord(data)) return undefined;
  const status = STATUSES.find((candidate) => candidate === data.status);
  const { time_zone: timeZone, slot_minutes: slotMinutes, first_date: firstDate, last_date: lastDate } = data;
  if (status === undefined || typeof timeZone !== "string" || timeZone.length === 0) return undefined;
  if (typeof slotMinutes !== "number" || !Number.isInteger(slotMinutes) || slotMinutes < 1) return undefined;
  if (!isCivilDate(firstDate) || !isCivilDate(lastDate) || lastDate < firstDate) return undefined;
  if (!Array.isArray(data.services)) return undefined;

  const services = data.services.map(parseService);
  if (services.some((service) => service === undefined)) return undefined;

  let service: BookableService | undefined;
  if (data.service !== undefined) {
    service = parseService(data.service);
    if (service === undefined) return undefined;
  }
  let date: string | undefined;
  if (data.date !== undefined) {
    if (!isCivilDate(data.date)) return undefined;
    date = data.date;
  }

  let slots: AvailableSlot[] = [];
  if (status === "SLOTS") {
    if (service === undefined || date === undefined || !Array.isArray(data.slots)) return undefined;
    const parsed = data.slots.map(parseSlot);
    if (parsed.some((slot) => slot === undefined)) return undefined;
    slots = parsed as AvailableSlot[];
  }

  return {
    timeZone,
    slotMinutes,
    firstDate,
    lastDate,
    services: services as BookableService[],
    status,
    ...(service !== undefined ? { service } : {}),
    ...(date !== undefined ? { date } : {}),
    slots,
  };
}

/**
 * The availability in the server's own form again, approved fields only — what
 * the website's availability endpoint sends, so the browser reads it with the
 * very same `parseAvailability`.
 */
export function availabilityToWire(availability: Availability): Record<string, unknown> {
  const service = (value: BookableService) => ({ id: value.id, name: value.name, duration_minutes: value.durationMinutes });
  return {
    time_zone: availability.timeZone,
    slot_minutes: availability.slotMinutes,
    first_date: availability.firstDate,
    last_date: availability.lastDate,
    services: availability.services.map(service),
    status: availability.status,
    ...(availability.service !== undefined ? { service: service(availability.service) } : {}),
    ...(availability.date !== undefined ? { date: availability.date } : {}),
    ...(availability.status === "SLOTS"
      ? {
          slots: availability.slots.map((slot) => ({
            starts_at: slot.startsAt,
            ends_at: slot.endsAt,
            local_time: slot.localTime,
          })),
        }
      : {}),
  };
}

export interface AvailabilityQuery {
  readonly serviceId?: string;
  readonly date?: string;
}

/** The `?service=…&date=…` of the preview, validated; anything malformed is simply absent. */
export function parseAvailabilityQuery(params: Readonly<Record<string, string | string[] | undefined>>): AvailabilityQuery {
  const single = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim() : undefined);
  const serviceId = single(params.service);
  const date = single(params.date);
  return {
    ...(isServiceId(serviceId) ? { serviceId } : {}),
    ...(isCivilDate(date) ? { date } : {}),
  };
}

function civilDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  // Noon UTC, formatted in UTC: the civil date never shifts with a time zone.
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Every local date of the window, in order (bounded). */
export function datesOfWindow(firstDate: string, lastDate: string): string[] {
  const dates: string[] = [];
  const cursor = civilDate(firstDate);
  const last = civilDate(lastDate).getTime();
  while (cursor.getTime() <= last && dates.length < MAX_WINDOW_DATES) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const LONG_DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

/** « lun. 16 nov. » */
export function formatShortDate(date: string): string {
  return SHORT_DATE.format(civilDate(date));
}

/** « lundi 16 novembre » */
export function formatLongDate(date: string): string {
  return LONG_DATE.format(civilDate(date));
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" });
const MONTH_SHORT = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" });

/** « lun. » — the first line of a two-line date chip. */
export function formatWeekdayShort(date: string): string {
  return WEEKDAY_SHORT.format(civilDate(date));
}

/** 16 — the second line of a two-line date chip. */
export function dayOfMonth(date: string): number {
  return civilDate(date).getUTCDate();
}

/** « déc. » — a month marker in the date strip. */
export function formatMonthShort(date: string): string {
  return MONTH_SHORT.format(civilDate(date));
}

/** « novembre 2026 » */
export function formatMonthYear(date: string): string {
  return MONTH_YEAR.format(civilDate(date));
}

/** « 45 min », « 1 h », « 1 h 30 » */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** « à l’heure de Paris » — which clock the times follow. */
export function describeTimeZone(timeZone: string): string {
  return timeZone === "Europe/Paris" ? "à l’heure de Paris" : `à l’heure locale (${timeZone})`;
}
