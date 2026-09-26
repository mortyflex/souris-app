// Souris — Communication Core (Lot B): the production transport registry
//
// EMAIL → ResendEmailTransport, SMS → UnsupportedChannelTransport (Lot C).
// The fake transport NEVER appears here: production either has its real
// provider configuration or refuses to run — it never silently pretends to
// send.
//
// Secrets are read through an injected reader (Deno.env in the entry, plain
// stubs in tests) and live only inside the transport instance. Missing or
// malformed configuration throws BEFORE anything is claimed, so a
// misconfigured deployment marks nothing PROCESSING and loses nothing.

import { isUsableEmailAddress, normalizeEmailLogoUrl } from './email-content.ts';
import { ResendEmailTransport } from './resend-transport.ts';
import type { TransportRegistry } from './transport.ts';
import { UnsupportedChannelTransport } from './unsupported-transport.ts';

export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerConfigurationError';
  }
}

export type SecretReader = (name: string) => string | undefined;

/**
 * Safe runtime diagnostic: whether the configured SOURIS_EMAIL_LOGO_URL is
 * present AND survives canonicalization — a boolean only, never the value.
 */
export function isEmailLogoConfigured(readSecret: SecretReader): boolean {
  return normalizeEmailLogoUrl(readSecret('SOURIS_EMAIL_LOGO_URL')) !== undefined;
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
  return {
    EMAIL: new ResendEmailTransport({ apiKey, fromEmail, logoUrl, fetchFn }),
    SMS: new UnsupportedChannelTransport('SMS'),
  };
}
