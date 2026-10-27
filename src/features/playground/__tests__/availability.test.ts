// BeautIzzy — Playground availability (the fail-closed rule)

import {
  isPlaygroundAvailable,
  readPlaygroundAvailability,
  resolvePlaygroundAvailability,
  resolveSupabaseProjectRef,
  STAGING_SUPABASE_PROJECT_REF,
} from '../availability';

const STAGING_URL = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = 'https://oxfqcgbtihczubisjyek.supabase.co';

describe('Playground availability', () => {
  it('is available in a development bundle pointed at the Staging project only', () => {
    expect(resolvePlaygroundAvailability({ debug: true, supabaseUrl: STAGING_URL })).toEqual({ kind: 'available' });
    // Whitespace and case around a public URL never decide anything.
    expect(resolvePlaygroundAvailability({ debug: true, supabaseUrl: ` ${STAGING_URL.toUpperCase()} ` })).toEqual({
      kind: 'available',
    });
  });

  it('is never available in a release bundle, whatever the environment says', () => {
    expect(resolvePlaygroundAvailability({ debug: false, supabaseUrl: STAGING_URL })).toEqual({
      kind: 'unavailable',
      reason: 'release-build',
    });
    expect(resolvePlaygroundAvailability({ debug: false, supabaseUrl: undefined })).toEqual({
      kind: 'unavailable',
      reason: 'release-build',
    });
  });

  it('fails closed on the Production project, an unknown environment or a malformed URL', () => {
    expect(resolvePlaygroundAvailability({ debug: true, supabaseUrl: PRODUCTION_URL })).toEqual({
      kind: 'unavailable',
      reason: 'supabase-not-staging',
    });
    for (const supabaseUrl of [undefined, '', '   ', 'not a url', 'http://iteufklnrsmazzvmzqxa.supabase.co', `${STAGING_URL}/rest/v1`]) {
      expect(resolvePlaygroundAvailability({ debug: true, supabaseUrl })).toEqual({
        kind: 'unavailable',
        reason: 'supabase-unconfigured',
      });
    }
  });

  it('reads the project ref of a project URL and nothing else', () => {
    expect(resolveSupabaseProjectRef(STAGING_URL)).toBe(STAGING_SUPABASE_PROJECT_REF);
    expect(resolveSupabaseProjectRef(PRODUCTION_URL)).toBe('oxfqcgbtihczubisjyek');
    expect(resolveSupabaseProjectRef('https://evil.example/iteufklnrsmazzvmzqxa.supabase.co')).toBeUndefined();
    expect(resolveSupabaseProjectRef('https://iteufklnrsmazzvmzqxa.supabase.co.evil.example')).toBeUndefined();
    expect(resolveSupabaseProjectRef(undefined)).toBeUndefined();
  });

  it('is unavailable in the test environment, which configures no Supabase URL', () => {
    expect(process.env.EXPO_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(readPlaygroundAvailability()).toEqual({ kind: 'unavailable', reason: 'supabase-unconfigured' });
    expect(isPlaygroundAvailable()).toBe(false);
  });
});
