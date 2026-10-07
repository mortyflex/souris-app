// BeautIzzy — Communication Core (SMS pivot Phase 2): client lifecycle SMS content
//
// The provider-neutral SMS renderer injected into the SMS transport. It
// supports EXACTLY the two client lifecycle kinds:
//
//   CLIENT_BIRTHDAY_OFFER      « Joyeux anniversaire {prénom} ! … »
//   INACTIVE_CLIENT_FOLLOWUP   « Bonjour {prénom}, ça fait longtemps ! … »
//
// Appointment SMS kinds have NO content: appointment reminders are
// permanently EMAIL-only (SMS pivot Phase 1), so any other kind returns
// undefined and the transport fails PERMANENTLY without a provider request.
//
// The payload is the minimal offer snapshot the server reconciliation stored
// (business_name, client_first_name, discount_percent, valid_until) —
// NOTHING else. No phone, appointment, service, price, note or consent
// detail can appear in an SMS because the renderer never receives one.
//
// Length: one SMS segment (~160 chars) is the target; 200 characters is the
// deterministic HARD ceiling. When a body overflows, only PRESENTATION text
// is compacted — the business name first, then the first name, then the
// no-name fallback copy — with a plain ASCII `...`; the discount and the
// validity date are never touched. Legitimate client names are never
// transliterated to force GSM-7: a Unicode name may make the provider use
// UCS-2, and that is accepted.
//
// V1 copy rules: no emoji, no link, no STOP text yet (test-only
// infrastructure until the production opt-out mechanism ships).

import type { OutgoingCommunication } from './transport.ts';

export const CLIENT_LIFECYCLE_SMS_KINDS = [
  'CLIENT_BIRTHDAY_OFFER',
  'INACTIVE_CLIENT_FOLLOWUP',
] as const;

export type ClientLifecycleSmsKind = (typeof CLIENT_LIFECYCLE_SMS_KINDS)[number];

export function isClientLifecycleSmsKind(kind: string): kind is ClientLifecycleSmsKind {
  return (CLIENT_LIFECYCLE_SMS_KINDS as readonly string[]).includes(kind);
}

/** The deterministic hard body ceiling; ≤ 160 stays the soft target. */
export const LIFECYCLE_SMS_HARD_LIMIT = 200;

export interface ClientLifecycleSmsPayload {
  readonly businessName: string;
  /** Undefined when the snapshot has no usable first name: fallback copy. */
  readonly clientFirstName: string | undefined;
  readonly discountPercent: number;
  /** Civil `YYYY-MM-DD` — a calendar date, never converted through a Date. */
  readonly validUntil: string;
}

const VALID_UNTIL_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Validates the queue payload the server reconciliation stored. Undefined
 * for anything malformed: the transport then fails PERMANENTLY — a broken
 * snapshot never becomes a retry loop or a half-empty offer.
 */
export function parseClientLifecycleSmsPayload(
  payload: Readonly<Record<string, unknown>>,
): ClientLifecycleSmsPayload | undefined {
  const businessName = readText(payload.business_name);
  if (businessName === undefined) return undefined;
  const discountPercent = payload.discount_percent;
  if (
    typeof discountPercent !== 'number' ||
    !Number.isInteger(discountPercent) ||
    discountPercent < 1 ||
    discountPercent > 100
  ) {
    return undefined;
  }
  const validUntil = readText(payload.valid_until);
  if (validUntil === undefined) return undefined;
  const match = VALID_UNTIL_SHAPE.exec(validUntil);
  if (!match) return undefined;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return {
    businessName,
    clientFirstName: readText(payload.client_first_name),
    discountPercent,
    validUntil,
  };
}

/**
 * `2026-10-04` → `04/10/2026`. Pure text: valid_until is a civil calendar
 * date frozen at enqueue time, never an instant — no Date, no timezone.
 */
export function formatLifecycleSmsDate(validUntil: string): string {
  const match = VALID_UNTIL_SHAPE.exec(validUntil);
  if (!match) return validUntil;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function truncateWithEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, Math.max(0, maxLength));
  return `${value.slice(0, maxLength - 3)}...`;
}

type ComposeBody = (firstName: string | undefined, businessName: string) => string;

/**
 * Deterministic fit under the hard ceiling. Presentation text only, in a
 * fixed order: compact the business name (down to 8 chars + `...`), then the
 * first name (down to 4 + `...`), then drop the name for the fallback copy,
 * then compact the business name as far as needed. Discount and date are
 * structural and never touched.
 */
function fitLifecycleSmsBody(
  compose: ComposeBody,
  firstName: string | undefined,
  businessName: string,
): string {
  let first = firstName;
  let business = businessName;
  let body = compose(first, business);
  if (body.length > LIFECYCLE_SMS_HARD_LIMIT) {
    business = truncateWithEllipsis(
      business,
      Math.max(8, business.length - (body.length - LIFECYCLE_SMS_HARD_LIMIT)),
    );
    body = compose(first, business);
  }
  if (body.length > LIFECYCLE_SMS_HARD_LIMIT && first !== undefined) {
    first = truncateWithEllipsis(
      first,
      Math.max(4, first.length - (body.length - LIFECYCLE_SMS_HARD_LIMIT)),
    );
    body = compose(first, business);
  }
  if (body.length > LIFECYCLE_SMS_HARD_LIMIT && first !== undefined) {
    first = undefined;
    body = compose(undefined, business);
  }
  if (body.length > LIFECYCLE_SMS_HARD_LIMIT) {
    business = truncateWithEllipsis(
      business,
      Math.max(1, business.length - (body.length - LIFECYCLE_SMS_HARD_LIMIT)),
    );
    body = compose(undefined, business);
  }
  return body;
}

/**
 * The `SmsContentRenderer` bound into the SMS transport: the rendered body
 * of one communication, or undefined when this communication has no SMS
 * content (non-lifecycle kind, non-SMS channel, malformed snapshot).
 */
export function renderSmsContent(communication: OutgoingCommunication): string | undefined {
  if (communication.channel !== 'SMS') return undefined;
  if (!isClientLifecycleSmsKind(communication.kind)) return undefined;
  const payload = parseClientLifecycleSmsPayload(communication.payload);
  if (payload === undefined) return undefined;

  // The discount and the date are structural: the fit only ever compacts the
  // two presentation values it is handed (first name, business name).
  const discount = payload.discountPercent;
  const date = formatLifecycleSmsDate(payload.validUntil);
  const offer = `vous offre -${discount}% sur votre prochaine prestation, valable jusqu'au ${date}.`;
  const compose: ComposeBody =
    communication.kind === 'CLIENT_BIRTHDAY_OFFER'
      ? (first, business) =>
          first === undefined
            ? `Joyeux anniversaire ! ${business} ${offer}`
            : `Joyeux anniversaire ${first} ! ${business} ${offer}`
      : (first, business) =>
          first === undefined
            ? `Bonjour, ça fait longtemps ! ${business} ${offer}`
            : `Bonjour ${first}, ça fait longtemps ! ${business} ${offer}`;
  return fitLifecycleSmsBody(compose, payload.clientFirstName, payload.businessName);
}
