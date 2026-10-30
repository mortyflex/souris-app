// BeautIzzy — the password recovery link, as the app receives it (pure)
//
// Supabase verifies the emailed link, then opens
// `sourisapp://reset-password` with either a one-time `code` (PKCE) or an
// `error` / `error_code` when the link expired or was already used. This
// reads the route parameters into ONE outcome; the code itself is only
// passed to the exchange, never displayed or logged.

import type { AuthFailure } from './gateway';

type RouteParam = string | string[] | undefined;

export interface RecoveryLinkParams {
  readonly code?: RouteParam;
  readonly error?: RouteParam;
  readonly error_code?: RouteParam;
}

export type RecoveryLink =
  | { readonly kind: 'code'; readonly code: string }
  | { readonly kind: 'failed'; readonly failure: AuthFailure };

/** Supabase codes are UUIDs; anything else is not worth a network call. */
const CODE_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/** Supabase reports an expired link and an already used one the same way. */
const EXPIRED_ERROR_CODES = new Set(['otp_expired', 'flow_state_expired']);

function first(value: RouteParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function readRecoveryLink(params: RecoveryLinkParams): RecoveryLink {
  const errorCode = first(params.error_code);
  if (errorCode !== undefined || first(params.error) !== undefined) {
    return {
      kind: 'failed',
      failure: { code: errorCode && EXPIRED_ERROR_CODES.has(errorCode) ? 'RECOVERY_LINK_EXPIRED' : 'RECOVERY_LINK_INVALID' },
    };
  }
  const code = first(params.code);
  return code !== undefined && CODE_PATTERN.test(code)
    ? { kind: 'code', code }
    : { kind: 'failed', failure: { code: 'RECOVERY_LINK_INVALID' } };
}
