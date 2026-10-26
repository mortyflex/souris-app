// BeautIzzy — Plus reconciliation: the function's secret — read once per request
//
//   REVENUECAT_RECONCILIATION_API_KEY   required. A RevenueCat SECRET API key
//                                       (`sk_…`, v1 REST API, read access)
//                                       DEDICATED to this function: never the
//                                       public SDK key of the app, never the
//                                       webhook's shared Authorization value,
//                                       and a separate key from the webhook's
//                                       own reconciliation key so each can be
//                                       rotated or revoked alone.
//
// The value lives in Edge Function secrets ONLY — never in the app bundle,
// Expo public env, SQLite, a public table or source control — and is read
// through an injected reader (Deno.env in the entry, plain stubs in tests).
// A missing or malformed value throws before anything is claimed, so a
// misconfigured deployment answers 500 and touches nothing. Messages name
// the variable, never the value.

export class ReconciliationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReconciliationConfigurationError';
  }
}

export type SecretReader = (name: string) => string | undefined;

export interface ReconciliationConfiguration {
  readonly apiKey: string;
}

export const RECONCILIATION_API_KEY_SECRET = 'REVENUECAT_RECONCILIATION_API_KEY';

export function readReconciliationConfiguration(readSecret: SecretReader): ReconciliationConfiguration {
  const apiKey = readSecret(RECONCILIATION_API_KEY_SECRET)?.trim();
  if (!apiKey) {
    throw new ReconciliationConfigurationError(`${RECONCILIATION_API_KEY_SECRET} is not configured`);
  }
  if (!/^sk_[A-Za-z0-9]+$/.test(apiKey)) {
    throw new ReconciliationConfigurationError(`${RECONCILIATION_API_KEY_SECRET} is not a RevenueCat secret API key (sk_…)`);
  }
  return { apiKey };
}
