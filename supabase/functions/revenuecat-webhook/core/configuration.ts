// BeautIzzy — Plus entitlement mirror: the webhook's secrets — read once per request
//
// Every value lives in Edge Function secrets ONLY — never in the app bundle,
// Expo public env, SQLite, a public table or source control — and is read
// through an injected reader (Deno.env in the entry, plain stubs in tests).
//
//   REVENUECAT_WEBHOOK_AUTHORIZATION   required. The exact Authorization header
//                                      value configured in the RevenueCat
//                                      webhook integration (a long random
//                                      value; `Bearer <random>` recommended).
//   REVENUECAT_WEBHOOK_SIGNING_SECRET  optional. The signing secret of the
//                                      integration when HMAC signatures are
//                                      enabled; every delivery is then verified.
//   REVENUECAT_SECRET_API_KEY          optional. A RevenueCat SECRET API key
//                                      (`sk_…`, v1 REST API, read access) that
//                                      enables the reconciliation of the
//                                      subscriber state after each event.
//   REVENUECAT_ALLOWED_APP_IDS         optional. Comma-separated RevenueCat app
//                                      ids; an event carrying another `app_id`
//                                      is recorded as IGNORED. Events without
//                                      `app_id` (promotional grants) pass.
//
// A missing or malformed REQUIRED value throws before anything is read from
// the request, so a misconfigured deployment answers 500 and processes
// nothing. Messages name variables, never values.

export class WebhookConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookConfigurationError';
  }
}

export type SecretReader = (name: string) => string | undefined;

export interface WebhookConfiguration {
  readonly authorization: string;
  readonly signingSecret: string | undefined;
  readonly secretApiKey: string | undefined;
  readonly allowedAppIds: readonly string[];
}

/** The minimum length of the shared Authorization value: a short one is a guessable one. */
export const MIN_AUTHORIZATION_LENGTH = 32;

export function parseAllowedAppIds(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return [...new Set(raw.split(/[,\s]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

export function readWebhookConfiguration(readSecret: SecretReader): WebhookConfiguration {
  const authorization = readSecret('REVENUECAT_WEBHOOK_AUTHORIZATION')?.trim();
  if (!authorization) {
    throw new WebhookConfigurationError('REVENUECAT_WEBHOOK_AUTHORIZATION is not configured');
  }
  if (authorization.length < MIN_AUTHORIZATION_LENGTH) {
    throw new WebhookConfigurationError(`REVENUECAT_WEBHOOK_AUTHORIZATION is shorter than ${MIN_AUTHORIZATION_LENGTH} characters`);
  }
  const signingSecret = readSecret('REVENUECAT_WEBHOOK_SIGNING_SECRET')?.trim();
  const secretApiKey = readSecret('REVENUECAT_SECRET_API_KEY')?.trim();
  if (secretApiKey !== undefined && secretApiKey.length > 0 && !/^sk_[A-Za-z0-9]+$/.test(secretApiKey)) {
    throw new WebhookConfigurationError('REVENUECAT_SECRET_API_KEY is not a RevenueCat secret API key (sk_…)');
  }
  return {
    authorization,
    signingSecret: signingSecret ? signingSecret : undefined,
    secretApiKey: secretApiKey ? secretApiKey : undefined,
    allowedAppIds: parseAllowedAppIds(readSecret('REVENUECAT_ALLOWED_APP_IDS')),
  };
}

/** Safe runtime diagnostics: booleans only, never a value. */
export function describeWebhookConfiguration(configuration: WebhookConfiguration): {
  readonly signatureConfigured: boolean;
  readonly reconciliationConfigured: boolean;
  readonly appIdFilterConfigured: boolean;
} {
  return {
    signatureConfigured: configuration.signingSecret !== undefined,
    reconciliationConfigured: configuration.secretApiKey !== undefined,
    appIdFilterConfigured: configuration.allowedAppIds.length > 0,
  };
}
