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

import { isUsableEmailAddress } from './email-content.ts';
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
  return {
    EMAIL: new ResendEmailTransport({ apiKey, fromEmail, fetchFn }),
    SMS: new UnsupportedChannelTransport('SMS'),
  };
}
