import {
  describeWebhookConfiguration,
  MIN_AUTHORIZATION_LENGTH,
  parseAllowedAppIds,
  readWebhookConfiguration,
  WebhookConfigurationError,
} from '../configuration';

const AUTHORIZATION = 'Bearer 0123456789abcdef0123456789abcdef';

function reader(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

describe('webhook configuration', () => {
  it('requires the shared Authorization value', () => {
    expect(() => readWebhookConfiguration(reader({}))).toThrow(WebhookConfigurationError);
    expect(() => readWebhookConfiguration(reader({ REVENUECAT_WEBHOOK_AUTHORIZATION: '   ' }))).toThrow(/REVENUECAT_WEBHOOK_AUTHORIZATION is not configured/);
  });

  it('refuses a short Authorization value, naming the variable and never the value', () => {
    expect(() => readWebhookConfiguration(reader({ REVENUECAT_WEBHOOK_AUTHORIZATION: 'short-secret' }))).toThrow(
      new RegExp(`shorter than ${MIN_AUTHORIZATION_LENGTH}`),
    );
    try {
      readWebhookConfiguration(reader({ REVENUECAT_WEBHOOK_AUTHORIZATION: 'short-secret' }));
    } catch (error) {
      expect((error as Error).message).not.toContain('short-secret');
    }
  });

  it('reads the optional values, trimmed, and leaves blanks undefined', () => {
    const configuration = readWebhookConfiguration(
      reader({
        REVENUECAT_WEBHOOK_AUTHORIZATION: ` ${AUTHORIZATION} `,
        REVENUECAT_WEBHOOK_SIGNING_SECRET: ' whsec_x ',
        REVENUECAT_SECRET_API_KEY: ' sk_ABCdef123 ',
        REVENUECAT_ALLOWED_APP_IDS: 'app1, app2 app1',
      }),
    );
    expect(configuration).toEqual({
      authorization: AUTHORIZATION,
      signingSecret: 'whsec_x',
      secretApiKey: 'sk_ABCdef123',
      allowedAppIds: ['app1', 'app2'],
    });
    expect(readWebhookConfiguration(reader({ REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION, REVENUECAT_WEBHOOK_SIGNING_SECRET: '' }))).toEqual({
      authorization: AUTHORIZATION,
      signingSecret: undefined,
      secretApiKey: undefined,
      allowedAppIds: [],
    });
  });

  it('refuses a RevenueCat key that is not a secret API key: a public SDK key never reaches the REST API', () => {
    for (const key of ['appl_abc', 'test_abc', 'goog_abc', 'not a key']) {
      expect(() => readWebhookConfiguration(reader({ REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION, REVENUECAT_SECRET_API_KEY: key }))).toThrow(
        /REVENUECAT_SECRET_API_KEY is not a RevenueCat secret API key/,
      );
    }
  });

  it('parses the allowed app ids like the other lists of the project', () => {
    expect(parseAllowedAppIds(undefined)).toEqual([]);
    expect(parseAllowedAppIds('')).toEqual([]);
    expect(parseAllowedAppIds(' a ,b,,a\n c')).toEqual(['a', 'b', 'c']);
  });

  it('describes the configuration with booleans only', () => {
    expect(
      describeWebhookConfiguration({ authorization: AUTHORIZATION, signingSecret: 'x', secretApiKey: undefined, allowedAppIds: [] }),
    ).toEqual({ signatureConfigured: true, reconciliationConfigured: false, appIdFilterConfigured: false });
    expect(
      describeWebhookConfiguration({ authorization: AUTHORIZATION, signingSecret: undefined, secretApiKey: 'sk_x', allowedAppIds: ['a'] }),
    ).toEqual({ signatureConfigured: false, reconciliationConfigured: true, appIdFilterConfigured: true });
  });
});
