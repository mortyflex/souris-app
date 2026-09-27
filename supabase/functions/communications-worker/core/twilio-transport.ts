// Souris — Communication Core (SMS pivot Phase 1): the Twilio SMS transport
//
// REUSABLE PROVIDER INFRASTRUCTURE, deliberately NOT bound into the
// production transport registry yet: appointment SMS reminders are retired,
// and the client-lifecycle SMS product (CLIENT_BIRTHDAY_OFFER,
// INACTIVE_CLIENT_FOLLOWUP) arrives in Phase 2. Until then, production SMS
// stays UnsupportedChannelTransport whatever secrets exist.
//
// The ONLY module that talks to Twilio. It is completely unaware of WHY an
// SMS is sent: the caller injects a provider-neutral renderer, and this
// transport knows only the recipient, the rendered body, the Twilio
// configuration and the provider response. It posts to the classic Twilio
// Messages REST resource — directly over fetch, no SDK — and translates the
// provider's answer into the three transport classes; nothing
// provider-specific leaks past this file:
//
//   2xx + valid Message SID     → SENT (the SID is the provider message id)
//   2xx without a usable SID    → PERMANENT_FAILURE (protocol failure; no
//                                 arbitrary response data is ever persisted)
//   429 / 5xx / network error   → RETRYABLE_FAILURE (central policy retries)
//   any other 4xx               → PERMANENT_FAILURE (invalid destination,
//                                 unverified trial recipient, invalid
//                                 sender, auth/config rejection: retrying
//                                 cannot fix it — the HTTP class decides,
//                                 never Twilio's human-readable message)
//
// A renderer refusal (undefined/blank body) is a PERMANENT failure with no
// provider request at all.
//
// SENT means Twilio ACCEPTED the message (its own status is typically
// `queued`) — never that the handset received it. That is the same meaning
// SENT already has for email, and no StatusCallback exists yet.
//
// Idempotence caveat (documented): unlike the EMAIL provider, this
// integration has no provider idempotency key. The database dedupe, the
// atomic claim and the pre-dispatch re-check still make a duplicate require
// the narrow ambiguous-network window (Twilio accepted, the response was
// lost, the worker retries) — theoretically a duplicate SMS. Reassess
// before broad production rollout.
//
// Privacy and secrets: the Account SID and Auth Token exist only in this
// closure; the Authorization header is built at call time and never logged.
// Error strings carry the HTTP status and Twilio's numeric error `code`
// only — never the recipient, the sender, the body, the credentials or a
// response dump.

import type {
  CommunicationTransport,
  OutgoingCommunication,
  TransportResult,
} from './transport.ts';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Provider-neutral content boundary: the rendered plain-text body of one
 * communication, or undefined when this communication has no SMS content
 * (the transport then fails PERMANENTLY without any provider request).
 * Phase 2's client-lifecycle renderer implements this shape.
 */
export type SmsContentRenderer = (
  communication: OutgoingCommunication,
) => string | undefined;

/**
 * The canonical E.164-like shape: what the server snapshotted into
 * `recipient`, and what a usable Twilio sender number looks like. A shape
 * CHECK only — this transport never normalizes phone numbers: the server
 * reconciliation is authoritative for canonicalization and eligibility.
 */
const E164_SHAPE = /^\+[1-9][0-9]{6,14}$/;

export function isCanonicalSmsNumber(value: string): boolean {
  return E164_SHAPE.test(value.trim());
}

/** The Messages API SID form (SM + 32 hex characters). */
const TWILIO_MESSAGE_SID_SHAPE = /^SM[0-9a-fA-F]{32}$/;

export function isTwilioMessageSid(value: unknown): value is string {
  return typeof value === 'string' && TWILIO_MESSAGE_SID_SHAPE.test(value);
}

export interface TwilioSmsTransportOptions {
  /** TWILIO_ACCOUNT_SID — also the Basic Auth username. */
  readonly accountSid: string;
  /** TWILIO_AUTH_TOKEN — the Basic Auth password. Never logged. */
  readonly authToken: string;
  /** TWILIO_FROM_NUMBER — the Twilio sender (E.164). */
  readonly fromNumber: string;
  /** The injected provider-neutral content boundary. */
  readonly renderBody: SmsContentRenderer;
  /** Injected in tests; the platform fetch in production. */
  readonly fetchFn?: typeof fetch;
}

export class TwilioSmsTransport implements CommunicationTransport {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly renderBody: SmsContentRenderer;
  private readonly fetchFn: typeof fetch;

  constructor(options: TwilioSmsTransportOptions) {
    this.accountSid = options.accountSid;
    this.authToken = options.authToken;
    this.fromNumber = options.fromNumber;
    this.renderBody = options.renderBody;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async send(message: OutgoingCommunication): Promise<TransportResult> {
    if (message.channel !== 'SMS') {
      return { status: 'PERMANENT_FAILURE', error: `twilio transport received channel ${message.channel}` };
    }
    if (!isCanonicalSmsNumber(message.recipient)) {
      return { status: 'PERMANENT_FAILURE', error: 'recipient is not a canonical sms destination' };
    }
    const renderedBody = this.renderBody(message);
    if (renderedBody === undefined || renderedBody.trim().length === 0) {
      return { status: 'PERMANENT_FAILURE', error: 'no sms content for this communication' };
    }

    const body = new URLSearchParams({
      To: message.recipient.trim(),
      From: this.fromNumber,
      Body: renderedBody,
    });

    let response: Response;
    try {
      response = await this.fetchFn(
        `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${this.accountSid}:${this.authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      );
    } catch {
      // No response at all: a transport-level problem, never a verdict.
      return { status: 'RETRYABLE_FAILURE', error: 'twilio: network failure' };
    }

    if (response.ok) {
      const responseBody = (await response.json().catch(() => undefined)) as
        | { readonly sid?: unknown }
        | undefined;
      if (isTwilioMessageSid(responseBody?.sid)) {
        return { status: 'SENT', providerMessageId: responseBody.sid };
      }
      // HTTP success without the expected identifier: a protocol failure,
      // and nothing arbitrary is persisted as a provider message id.
      return {
        status: 'PERMANENT_FAILURE',
        error: 'twilio: accepted response without a usable message sid',
      };
    }

    // Sanitized diagnosis: the HTTP status and Twilio's stable numeric error
    // `code` (e.g. 21608 for an unverified trial recipient) — never the
    // human-readable message, which may quote phone numbers.
    const errorBody = (await response.json().catch(() => undefined)) as
      | { readonly code?: unknown }
      | undefined;
    const code = typeof errorBody?.code === 'number' ? ` (code ${errorBody.code})` : '';
    const error = `twilio: ${response.status}${code}`;

    if (response.status === 429 || response.status >= 500) {
      return { status: 'RETRYABLE_FAILURE', error };
    }
    return { status: 'PERMANENT_FAILURE', error };
  }
}
