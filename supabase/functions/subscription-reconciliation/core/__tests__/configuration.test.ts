// The dedicated RevenueCat secret: required, validated by shape, never echoed.

import { RECONCILIATION_API_KEY_SECRET, readReconciliationConfiguration, ReconciliationConfigurationError } from '../configuration';

const reader = (values: Record<string, string | undefined>) => (name: string) => values[name];

describe('subscription-reconciliation configuration', () => {
  it('reads the dedicated secret key (trimmed)', () => {
    expect(readReconciliationConfiguration(reader({ [RECONCILIATION_API_KEY_SECRET]: '  sk_RECONCILE123  ' }))).toEqual({ apiKey: 'sk_RECONCILE123' });
  });

  it('scenario 14: a missing or blank credential throws a configuration error naming the variable, never a value', () => {
    for (const values of [{}, { [RECONCILIATION_API_KEY_SECRET]: '' }, { [RECONCILIATION_API_KEY_SECRET]: '   ' }]) {
      expect(() => readReconciliationConfiguration(reader(values))).toThrow(ReconciliationConfigurationError);
      expect(() => readReconciliationConfiguration(reader(values))).toThrow(`${RECONCILIATION_API_KEY_SECRET} is not configured`);
    }
  });

  it('refuses a value that is not a RevenueCat secret key: the public SDK key, the webhook Authorization value, a Supabase key', () => {
    for (const value of ['appl_PUBLICKEY123456', 'test_PUBLICKEY1234', 'Bearer some-long-random-webhook-authorization-value', 'sb_secret_abcdef', 'sk_with-dash']) {
      let message = '';
      try {
        readReconciliationConfiguration(reader({ [RECONCILIATION_API_KEY_SECRET]: value }));
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe(`${RECONCILIATION_API_KEY_SECRET} is not a RevenueCat secret API key (sk_…)`);
      expect(message).not.toContain(value);
    }
  });

  it('never falls back to the webhook secrets or the app keys', () => {
    expect(() =>
      readReconciliationConfiguration(
        reader({ REVENUECAT_SECRET_API_KEY: 'sk_WEBHOOKKEY', REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer x'.padEnd(40, 'x'), EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_x' }),
      ),
    ).toThrow(ReconciliationConfigurationError);
  });
});
