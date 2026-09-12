// Souris — Supabase configuration boundary
//
// The ONLY place that reads the Supabase environment. Expo inlines
// `process.env.EXPO_PUBLIC_*` at build time, so the two variables must be
// referenced literally. Both values are public client configuration (they
// ship inside the app); security comes from Auth + Row Level Security. The
// service_role / secret key and the database password never enter the app.
//
// A missing or malformed value yields one controlled configuration error,
// which the Auth boundary surfaces as a recoverable state instead of a crash.

export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

export interface RawSupabaseConfig {
  readonly url: string | undefined;
  readonly publishableKey: string | undefined;
}

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigurationError';
  }
}

/** Pure validation, exported so it can be verified without touching `process.env`. */
export function resolveSupabaseConfig(raw: RawSupabaseConfig): SupabaseConfig {
  const url = raw.url?.trim() ?? '';
  const publishableKey = raw.publishableKey?.trim() ?? '';

  if (url.length === 0) {
    throw new SupabaseConfigurationError(
      'EXPO_PUBLIC_SUPABASE_URL is missing. Copy .env.example to .env and fill it from the Supabase project Connect panel.',
    );
  }
  if (!/^https:\/\/[^\s/]+$/i.test(url)) {
    throw new SupabaseConfigurationError(
      'EXPO_PUBLIC_SUPABASE_URL must be the project URL (https://<project-ref>.supabase.co) without a trailing path.',
    );
  }
  if (publishableKey.length === 0) {
    throw new SupabaseConfigurationError(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing. Copy .env.example to .env and fill it from the Supabase project Connect panel.',
    );
  }
  if (/^sb_secret_/i.test(publishableKey)) {
    throw new SupabaseConfigurationError(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret key. Only the publishable key may ship inside the application.',
    );
  }

  return { url, publishableKey };
}

/** Reads the build-time environment. Throws `SupabaseConfigurationError` when incomplete. */
export function readSupabaseConfig(): SupabaseConfig {
  return resolveSupabaseConfig({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
