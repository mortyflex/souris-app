import { resolveSupabaseConfig, SupabaseConfigurationError } from '../config';

describe('resolveSupabaseConfig', () => {
  it('accepts a project URL and a publishable key, trimming whitespace', () => {
    expect(
      resolveSupabaseConfig({
        url: ' https://abcdefgh.supabase.co ',
        publishableKey: ' sb_publishable_example ',
      }),
    ).toEqual({ url: 'https://abcdefgh.supabase.co', publishableKey: 'sb_publishable_example' });
  });

  it('rejects a missing URL or key with a controlled configuration error', () => {
    expect(() => resolveSupabaseConfig({ url: undefined, publishableKey: 'sb_publishable_x' })).toThrow(
      SupabaseConfigurationError,
    );
    expect(() => resolveSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: '' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing/,
    );
  });

  it('rejects a malformed URL and a secret key', () => {
    expect(() => resolveSupabaseConfig({ url: 'abc.supabase.co', publishableKey: 'sb_publishable_x' })).toThrow(
      /must be the project URL/,
    );
    expect(() =>
      resolveSupabaseConfig({ url: 'https://abc.supabase.co/rest/v1', publishableKey: 'sb_publishable_x' }),
    ).toThrow(SupabaseConfigurationError);
    expect(() => resolveSupabaseConfig({ url: 'https://abc.supabase.co', publishableKey: 'sb_secret_x' })).toThrow(
      /secret key/,
    );
  });
});
