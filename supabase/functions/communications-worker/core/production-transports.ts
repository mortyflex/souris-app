// BeautIzzy — Communication Core: the production transport registry
//
// EMAIL → ResendEmailTransport, always required: a deployment without the
// Resend secrets refuses the whole pass BEFORE anything is claimed.
//
// SMS → TwilioSmsTransport (SMS pivot Phase 2), bound ONLY when ALL THREE
// Twilio values are present and valid (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_FROM_NUMBER — the sender must be canonical E.164). Anything less
// binds UnsupportedChannelTransport: an SMS record then fails permanently
// and explicitly. The transport receives the client-lifecycle renderer
// through its injected renderer boundary, so appointment SMS kinds have no
// content and can never be sent — appointment reminders stay EMAIL-only.
//
// The fake transport NEVER appears here: production either has its real
// provider configuration or refuses to run — it never silently pretends to
// send.
//
// Secrets are read through an injected reader (Deno.env in the entry, plain
// stubs in tests) and live only inside the transport instances. Missing or
// malformed EMAIL configuration throws BEFORE anything is claimed, so a
// misconfigured deployment marks nothing PROCESSING and loses nothing.

import { isUsableEmailAddress, normalizeEmailLogoUrl } from './email-content.ts';
import { ResendEmailTransport } from './resend-transport.ts';
import { renderSmsContent } from './sms-content.ts';
import type { TransportRegistry } from './transport.ts';
import { isCanonicalSmsNumber, TwilioSmsTransport } from './twilio-transport.ts';
import { UnsupportedChannelTransport } from './unsupported-transport.ts';

export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerConfigurationError';
  }
}

export type SecretReader = (name: string) => string | undefined;

/**
 * Safe runtime diagnostic: whether the configured SOURIS_EMAIL_LOGO_URL (the
 * historical name of the BeautIzzy email logo secret, deliberately kept) is
 * present AND survives canonicalization — a boolean only, never the value.
 */
export function isEmailLogoConfigured(readSecret: SecretReader): boolean {
  return normalizeEmailLogoUrl(readSecret('SOURIS_EMAIL_LOGO_URL')) !== undefined;
}

interface TwilioConfiguration {
  readonly accountSid: string;
  readonly authToken: string;
  readonly fromNumber: string;
}

/**
 * The ONE Twilio binding rule: all three values present and non-blank, and
 * the sender number canonical E.164. Anything less reads as "not
 * configured" — never a partial binding, never an exception (EMAIL must
 * keep working while SMS is unconfigured).
 */
function readTwilioConfiguration(readSecret: SecretReader): TwilioConfiguration | undefined {
  const accountSid = readSecret('TWILIO_ACCOUNT_SID')?.trim();
  const authToken = readSecret('TWILIO_AUTH_TOKEN')?.trim();
  const fromNumber = readSecret('TWILIO_FROM_NUMBER')?.trim();
  if (!accountSid || !authToken || !fromNumber || !isCanonicalSmsNumber(fromNumber)) {
    return undefined;
  }
  return { accountSid, authToken, fromNumber };
}

/**
 * Truthful smoke indicator: TRUE exactly when this registry factory would
 * bind the real SMS transport. A boolean only — it never exposes the
 * Account SID, the Auth Token, the sender number or any recipient.
 */
export function isSmsConfigured(readSecret: SecretReader): boolean {
  return readTwilioConfiguration(readSecret) !== undefined;
}

export function createProductionTransportRegistry(
  readSecret: SecretReader,
  fetchFn?: typeof fetch,
): TransportRegistry {
  const apiKey = readSecret('RESEND_API_KEY')?.trim();
  const fromEmail = readSecret('RESEND_FROM_EMAIL')?.trim();
  if (!apiKey) {
    throw new WorkerConfigurationError('RESEND_API_KEY is not configured');
  }
  if (!fromEmail || !isUsableEmailAddress(fromEmail)) {
    throw new WorkerConfigurationError('RESEND_FROM_EMAIL is not a configured, valid sender address');
  }
  // Optional footer branding: absent or unusable, emails simply keep the
  // text-only footer. Canonicalized by the ONE rule the renderer applies.
  const logoUrl = normalizeEmailLogoUrl(readSecret('SOURIS_EMAIL_LOGO_URL'));
  const twilio = readTwilioConfiguration(readSecret);
  return {
    EMAIL: new ResendEmailTransport({ apiKey, fromEmail, logoUrl, fetchFn }),
    SMS: twilio
      ? new TwilioSmsTransport({ ...twilio, renderBody: renderSmsContent, fetchFn })
      : new UnsupportedChannelTransport('SMS'),
  };
}
