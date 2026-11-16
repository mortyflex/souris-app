/**
 * A booking request, as the website sends it to its own server and the
 * server sends it to the booking engine (`online_booking_create_booking`).
 *
 * The customer supplies ONLY these fields: a service id, a start instant
 * (one the availability offered), a name, a contact and an idempotency key.
 * The Business, the staff member, the duration, the price, the phases and the
 * availability are decided by the server, never read from here.
 *
 * The rules below mirror the engine's ONE validation rule
 * (`online_booking_request_issue`, supabase/migrations/
 * 20261018120000_create_online_booking_creation.sql) so the customer sees a
 * field message before anything is sent. The engine stays the authority: a
 * value it refuses is answered as INVALID_REQUEST + field all the same.
 *
 * Pure: imported by the browser (form messages) and by the server (the
 * request boundary). The wire vocabulary is the engine's (snake_case).
 */

import { isServiceId } from "@/features/availability/availability";

export const CUSTOMER_FIELDS = ["firstName", "lastName", "email", "phone"] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];
export type CustomerDetails = Readonly<Record<CustomerField, string>>;
export const EMPTY_DETAILS: CustomerDetails = { firstName: "", lastName: "", email: "", phone: "" };

/** The engine's field names: INVALID_REQUEST answers one of them. */
export type EngineField = "idempotency_key" | "service_id" | "starts_at" | "first_name" | "last_name" | "email" | "phone";
export const ENGINE_FIELDS: readonly EngineField[] = [
  "idempotency_key",
  "service_id",
  "starts_at",
  "first_name",
  "last_name",
  "email",
  "phone",
];

const CUSTOMER_FIELD_OF: Readonly<Partial<Record<EngineField, CustomerField>>> = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  phone: "phone",
};

/** The form field an engine field names, when it is one the customer typed. */
export function customerFieldOf(field: EngineField): CustomerField | undefined {
  return CUSTOMER_FIELD_OF[field];
}

export interface BookingRequest {
  readonly serviceId: string;
  /** UTC instant `YYYY-MM-DDTHH:MM:SSZ`, exactly as the availability returned it. */
  readonly startsAt: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

export type FieldIssue = "required" | "too_long" | "invalid";
export type CustomerIssues = Partial<Record<CustomerField, FieldIssue>>;

// ---------------------------------------------------------------------------
// Character classes, built from code points (no invisible character in the source).
// ---------------------------------------------------------------------------
const BACKSLASH = String.fromCharCode(92);
type CodePoints = ReadonlyArray<number | readonly [number, number]>;
const escape = (code: number) => `${BACKSLASH}u{${code.toString(16)}}`;
const charClass = (points: CodePoints) =>
  points.map((point) => (typeof point === "number" ? escape(point) : `${escape(point[0])}-${escape(point[1])}`)).join("");

/** What JavaScript `trim()` removes, plus the zero-width characters: never « visible ». */
const INVISIBLE: CodePoints = [[0x09, 0x0d], 0x20, 0xa0, 0x1680, [0x2000, 0x200d], 0x2028, 0x2029, 0x202f, 0x205f, 0x2060, 0x3000, 0xfeff];
const VISIBLE_CHARACTER = new RegExp(`[^${charClass(INVISIBLE)}]`, "u");
/** Control characters (NUL included), line and paragraph separators, bidirectional overrides. */
const FORBIDDEN_CHARACTER = new RegExp(
  `[${charClass([[0x00, 0x1f], [0x7f, 0x9f], 0x2028, 0x2029, [0x202a, 0x202e], [0x2066, 0x2069]])}]`,
  "u",
);
/** Any whitespace or zero-width character: never inside an email address. */
const EMAIL_SPACE = new RegExp(`[${charClass(INVISIBLE)}]`, "u");

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

const NAME_MAX = 80;
const EMAIL_MAX = 320;
const PHONE_MAX = 40;

/** Length in characters (code points), as the database counts it. */
const lengthOf = (value: string) => Array.from(value).length;

/** A string the database can store: no lone surrogate (it would break the JSON on the way). */
function isWellFormed(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

function isPlainText(value: string, max: number): boolean {
  return (
    isWellFormed(value) &&
    lengthOf(value) >= 1 &&
    lengthOf(value) <= max &&
    VISIBLE_CHARACTER.test(value) &&
    !FORBIDDEN_CHARACTER.test(value)
  );
}

/**
 * The phone canonicalization of the server (`communications_client_phone_e164`):
 * E.164, the `00` international prefix, or a French national number. Spaces,
 * dots, hyphens and parentheses are separators; anything else fails.
 */
export function phoneE164(phone: string): string | undefined {
  const compact = phone.trim().replace(/[ .()-]/g, "");
  if (/^\+[1-9][0-9]{6,14}$/.test(compact)) return compact;
  if (/^00[1-9][0-9]{6,14}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^0[1-9][0-9]{8}$/.test(compact)) return `+33${compact.slice(1)}`;
  return undefined;
}

function nameIssue(value: string): FieldIssue | undefined {
  if (value.length === 0 || !VISIBLE_CHARACTER.test(value)) return "required";
  if (lengthOf(value) > NAME_MAX) return "too_long";
  return isPlainText(value, NAME_MAX) ? undefined : "invalid";
}

function emailIssue(value: string): FieldIssue | undefined {
  if (value.length === 0) return "required";
  if (lengthOf(value) > EMAIL_MAX) return "too_long";
  if (!isPlainText(value, EMAIL_MAX) || EMAIL_SPACE.test(value) || !EMAIL_SHAPE.test(value) || lengthOf(value) < 3) {
    return "invalid";
  }
  return undefined;
}

function phoneIssue(value: string): FieldIssue | undefined {
  if (value.length === 0) return "required";
  if (lengthOf(value) > PHONE_MAX) return "too_long";
  if (!isWellFormed(value) || FORBIDDEN_CHARACTER.test(value) || phoneE164(value) === undefined) return "invalid";
  return undefined;
}

/** Each detail as it is sent and stored: without what JavaScript `trim()` removes. */
export function cleanDetails(details: CustomerDetails): CustomerDetails {
  return {
    firstName: details.firstName.trim(),
    lastName: details.lastName.trim(),
    email: details.email.trim(),
    phone: details.phone.trim(),
  };
}

/** The first problem of each field, after cleaning; empty when the details can be sent. */
export function customerIssues(details: CustomerDetails): CustomerIssues {
  const clean = cleanDetails(details);
  const issues: Record<string, FieldIssue> = {};
  const first = nameIssue(clean.firstName);
  const last = nameIssue(clean.lastName);
  const email = emailIssue(clean.email);
  const phone = phoneIssue(clean.phone);
  if (first) issues.firstName = first;
  if (last) issues.lastName = last;
  if (email) issues.email = email;
  if (phone) issues.phone = phone;
  return issues;
}

export function hasIssues(issues: CustomerIssues): boolean {
  return CUSTOMER_FIELDS.some((field) => issues[field] !== undefined);
}

export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY.test(value);
}

/** A UTC instant in the availability's exact form, and a real one. */
export function isUtcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value.replace("Z", ".000Z");
}

// ---------------------------------------------------------------------------
// The wire: what the browser POSTs, read by the server
// ---------------------------------------------------------------------------
export interface BookingRequestWire {
  readonly service_id: string;
  readonly starts_at: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
  readonly phone: string;
  readonly idempotency_key: string;
}

const WIRE_KEYS: readonly (keyof BookingRequestWire)[] = [
  "service_id",
  "starts_at",
  "first_name",
  "last_name",
  "email",
  "phone",
  "idempotency_key",
];

export function toRequestWire(request: BookingRequest, idempotencyKey: string): BookingRequestWire {
  return {
    service_id: request.serviceId,
    starts_at: request.startsAt,
    first_name: request.firstName,
    last_name: request.lastName,
    email: request.email,
    phone: request.phone,
    idempotency_key: idempotencyKey,
  };
}

export type ParsedRequest =
  | { readonly ok: true; readonly request: BookingRequest; readonly idempotencyKey: string }
  /** Not a booking request at all: wrong type, missing or extra keys. */
  | { readonly ok: false; readonly malformed: true }
  /** A booking request with one unacceptable field (the engine's name for it). */
  | { readonly ok: false; readonly malformed: false; readonly field: EngineField };

/**
 * Reads a POSTed body: exactly the seven keys, all strings — nothing else is
 * accepted, so nothing else can ever be forwarded. Then the field rules, in
 * the engine's order. Values are cleaned the way they will be stored.
 */
export function parseRequestWire(data: unknown): ParsedRequest {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { ok: false, malformed: true };
  const row = data as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== WIRE_KEYS.length || !WIRE_KEYS.every((key) => typeof row[key] === "string")) {
    return { ok: false, malformed: true };
  }
  const wire = row as unknown as BookingRequestWire;

  if (!isIdempotencyKey(wire.idempotency_key)) return { ok: false, malformed: false, field: "idempotency_key" };
  const serviceId = wire.service_id.trim();
  if (!isServiceId(serviceId)) return { ok: false, malformed: false, field: "service_id" };
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
    request: { serviceId, startsAt: wire.starts_at, ...details },
  };
}
