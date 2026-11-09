// BeautIzzy — the Google sign-in callback, as the app receives it (pure)
//
// Supabase ends the OAuth flow by opening `<scheme>://auth-callback` with
// either a one-time `code` (PKCE) or an `error` / `error_code`. The same URL
// reaches the app twice on Android (the browser session's result AND the deep
// link the router opens), once on iOS (ASWebAuthenticationSession keeps it),
// and on a cold start only through the router. Both entries read it here
// into ONE outcome; the code is only handed to the exchange, never displayed
// or logged.

import type { AuthFailure } from './gateway';

type RouteParam = string | string[] | undefined;

export interface OAuthCallbackParams {
  readonly code?: RouteParam;
  readonly error?: RouteParam;
  readonly error_code?: RouteParam;
}

export type OAuthCallback =
  | { readonly kind: 'code'; readonly code: string }
  /** The professional refused or backed out on the provider's consent screen. */
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

/** Supabase codes are UUIDs; anything else is not worth a network call. */
const CODE_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/** `access_denied`: the consent screen was refused or closed — a cancellation, not a failure. */
const CANCELLED_ERRORS = new Set(['access_denied']);
/** The provider is not enabled on the Supabase project of this build. */
const UNAVAILABLE_ERROR_CODES = new Set(['provider_disabled']);

function first(value: RouteParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function readOAuthCallback(params: OAuthCallbackParams): OAuthCallback {
  const error = first(params.error);
  const errorCode = first(params.error_code);
  if (error !== undefined || errorCode !== undefined) {
    if (error !== undefined && CANCELLED_ERRORS.has(error)) return { kind: 'cancelled' };
    return {
      kind: 'failed',
      failure: { code: errorCode && UNAVAILABLE_ERROR_CODES.has(errorCode) ? 'PROVIDER_UNAVAILABLE' : 'SOCIAL_SIGN_IN_FAILED' },
    };
  }
  const code = first(params.code);
  return code !== undefined && CODE_PATTERN.test(code)
    ? { kind: 'code', code }
    : { kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } };
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return undefined;
  }
}

/** Query AND fragment: Supabase reports some errors in the fragment. Later keys never replace earlier ones. */
function readUrlParams(rest: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of rest.split(/[?#&]/)) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = decode(part.slice(0, separator));
    const value = decode(part.slice(separator + 1));
    if (key !== undefined && value !== undefined && !(key in params)) params[key] = value;
  }
  return params;
}

/**
 * The browser session's result URL. Anything that does not return to the
 * exact redirect this flow asked for (another scheme, another path) is
 * refused before its parameters are even read.
 */
export function readOAuthCallbackUrl(url: string, redirectUrl: string): OAuthCallback {
  const rest = url.startsWith(redirectUrl) ? url.slice(redirectUrl.length) : undefined;
  if (rest === undefined || (rest.length > 0 && !/^[?#]/.test(rest))) {
    return { kind: 'failed', failure: { code: 'SOCIAL_SIGN_IN_FAILED' } };
  }
  return readOAuthCallback(readUrlParams(rest));
}
