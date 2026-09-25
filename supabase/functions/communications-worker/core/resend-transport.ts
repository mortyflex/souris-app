// Souris — Communication Core (Lot B): the real EMAIL transport (Resend)
//
// The ONLY module that talks to the provider. It composes the fixed Souris
// templates (email-content.ts), posts them to the Resend REST API, and
// translates the provider's answer into the three transport classes — nothing
// provider-specific leaks past this file:
//
//   2xx                         → SENT (provider message id)
//   429 / 5xx / network error   → RETRYABLE_FAILURE (central policy retries)
//   any other 4xx               → PERMANENT_FAILURE (invalid request or
//                                 recipient: retrying cannot fix it)
//
// Idempotence: on top of the database dedupe, every request carries a stable
// `Idempotency-Key` derived from the IMMUTABLE communication id, so a retry
// of the same record can never produce a second provider email.
//
// Privacy and secrets: the API key exists only in this closure and is never
// part of an error or a log; error strings carry status codes and Resend's
// error `name`, never the recipient, the payload, headers or a response dump.

import type {
  CommunicationTransport,
  OutgoingCommunication,
  TransportResult,
} from './transport.ts';
import {
  isAppointmentEmailKind,
  isUsableEmailAddress,
  parseAppointmentEmailPayload,
  renderAppointmentEmail,
} from './email-content.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendEmailTransportOptions {
  readonly apiKey: string;
  /** The verified Souris sender address (RESEND_FROM_EMAIL). */
  readonly fromEmail: string;
  /** Injected in tests; the platform fetch in production. */
  readonly fetchFn?: typeof fetch;
}

/**
 * The From display name carries the professional's business name. Header
 * safety: control characters, quotes and angle brackets are stripped so an
 * hostile business name can neither escape the quoted display name nor
 * inject a header line.
 */
export function sanitizeSenderDisplayName(businessName: string): string {
  const cleaned = businessName
    .replace(/[\r\n\t"<>\\;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned.length > 0 ? `${cleaned} via Souris` : 'Souris';
}

/** The stable provider idempotency key of one logical communication. */
export function resendIdempotencyKey(communicationId: string): string {
  return `souris-communication-${communicationId}`;
}

export class ResendEmailTransport implements CommunicationTransport {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: ResendEmailTransportOptions) {
    this.apiKey = options.apiKey;
    this.fromEmail = options.fromEmail;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async send(message: OutgoingCommunication): Promise<TransportResult> {
    if (message.channel !== 'EMAIL') {
      return { status: 'PERMANENT_FAILURE', error: `resend transport received channel ${message.channel}` };
    }
    if (!isAppointmentEmailKind(message.kind)) {
      return { status: 'PERMANENT_FAILURE', error: `no email template for kind ${message.kind}` };
    }
    const payload = parseAppointmentEmailPayload(message.payload);
    if (!payload) {
      return { status: 'PERMANENT_FAILURE', error: 'invalid appointment email payload' };
    }
    if (!isUsableEmailAddress(message.recipient)) {
      return { status: 'PERMANENT_FAILURE', error: 'recipient is not a usable email address' };
    }

    const email = renderAppointmentEmail(message.kind, payload);
    const request: Record<string, unknown> = {
      from: `"${sanitizeSenderDisplayName(payload.businessName)}" <${this.fromEmail}>`,
      to: [message.recipient.trim()],
      subject: email.subject,
      html: email.html,
      text: email.text,
    };
    if (payload.replyTo !== undefined) {
      request.reply_to = [payload.replyTo];
    }

    let response: Response;
    try {
      response = await this.fetchFn(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': resendIdempotencyKey(message.id),
        },
        body: JSON.stringify(request),
      });
    } catch {
      // No response at all: a transport-level problem, never a verdict.
      return { status: 'RETRYABLE_FAILURE', error: 'resend: network failure' };
    }

    if (response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | { readonly id?: unknown }
        | undefined;
      const providerMessageId = typeof body?.id === 'string' ? body.id : undefined;
      return providerMessageId !== undefined
        ? { status: 'SENT', providerMessageId }
        : { status: 'SENT' };
    }

    // Sanitized diagnosis: the HTTP status and Resend's stable error `name`
    // (e.g. validation_error) — never the message, which may quote addresses.
    const errorBody = (await response.json().catch(() => undefined)) as
      | { readonly name?: unknown }
      | undefined;
    const errorName = typeof errorBody?.name === 'string' ? errorBody.name : 'unknown_error';
    const error = `resend: ${response.status} ${errorName}`;

    if (response.status === 429 || response.status >= 500) {
      return { status: 'RETRYABLE_FAILURE', error };
    }
    return { status: 'PERMANENT_FAILURE', error };
  }
}
