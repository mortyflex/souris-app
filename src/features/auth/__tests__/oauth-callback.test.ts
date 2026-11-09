import { contactEmailOf, isApplePrivateRelayEmail } from '../account-email';
import { readOAuthCallback, readOAuthCallbackUrl } from '../oauth-callback';

const CODE = '0b6c4f5e-1111-4a5b-9c9d-123456789abc';
const REDIRECT = 'sourisapp-dev://auth-callback';

describe('readOAuthCallback (route parameters)', () => {
  it('reads a valid one-time code', () => {
    expect(readOAuthCallback({ code: CODE })).toEqual({ kind: 'code', code: CODE });
    expect(readOAuthCallback({ code: [CODE, 'other-code-123'] })).toEqual({ kind: 'code', code: CODE });
  });

  it('a refused consent is a cancellation; a disabled provider and every other error are failures, never exchanged', () => {
    expect(readOAuthCallback({ error: 'access_denied', code: CODE })).toEqual({ kind: 'cancelled' });
    expect(readOAuthCallback({ error: 'invalid_request', error_code: 'provider_disabled' })).toEqual({
      kind: 'failed',
      failure: { code: 'PROVIDER_UNAVAILABLE' },
    });
    expect(readOAuthCallback({ error: 'server_error', code: CODE })).toEqual({
      kind: 'failed',
      failure: { code: 'SOCIAL_SIGN_IN_FAILED' },
    });
  });

  it('refuses a missing or malformed code before any network call', () => {
    for (const code of [undefined, '', 'short', '<script>alert(1)</script>', 'a'.repeat(200)]) {
      expect(readOAuthCallback({ code })).toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
    }
  });
});

describe('readOAuthCallbackUrl (the browser result)', () => {
  it('reads the query and the fragment of the exact redirect', () => {
    expect(readOAuthCallbackUrl(`${REDIRECT}?code=${CODE}`, REDIRECT)).toEqual({ kind: 'code', code: CODE });
    expect(readOAuthCallbackUrl(`${REDIRECT}#error=access_denied&error_description=User+denied`, REDIRECT)).toEqual({
      kind: 'cancelled',
    });
  });

  it('refuses a URL that is not this flow’s redirect', () => {
    for (const url of [`sourisapp://auth-callback?code=${CODE}`, `${REDIRECT}-x?code=${CODE}`, `https://evil.example/?code=${CODE}`]) {
      expect(readOAuthCallbackUrl(url, REDIRECT)).toEqual({ kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } });
    }
  });

  it('a duplicated key never replaces the first one', () => {
    expect(readOAuthCallbackUrl(`${REDIRECT}?code=${CODE}&code=attacker-code-1234`, REDIRECT)).toEqual({ kind: 'code', code: CODE });
  });
});

describe('account email', () => {
  it('recognises an Apple private relay address, which is never a contact address', () => {
    expect(isApplePrivateRelayEmail('x7k2m9q4@privaterelay.appleid.com')).toBe(true);
    expect(isApplePrivateRelayEmail('X7K2@PrivateRelay.AppleID.com ')).toBe(true);
    expect(isApplePrivateRelayEmail('lea@example.com')).toBe(false);
    expect(isApplePrivateRelayEmail(undefined)).toBe(false);
    expect(contactEmailOf('x7k2m9q4@privaterelay.appleid.com')).toBeUndefined();
    expect(contactEmailOf('lea@example.com')).toBe('lea@example.com');
  });
});
