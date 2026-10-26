// BeautIzzy — the business write guard (BeautIzzy Plus)
//
// THE one way a business mutation is refused for lack of access. The
// decision comes exclusively from BusinessAccess, resolved by the domain
// through BusinessAccessProvider; nothing here compares a date, reads a
// subscription or knows a plan.
//
//   full access       the mutation runs exactly as before;
//   read-only access  `BusinessAccessDeniedError`, carrying the domain's
//                     ReadOnlyReason and the operation that was refused.
//
// The mutation-entry boundary. Every USER-INITIATED mutation exposed by a
// business session provider (Clients, Services, Products, Sales,
// Appointments, Calendar Blocks, the reminder preference) calls the guard as
// its FIRST statement — before any read of the committed collection, any
// SQLite write, any outbox entry, any upload, any gateway call and any state
// change. A compound operation is therefore refused whole or not at all, and
// an operation that was legitimately started while access was full (a photo
// upload awaiting its row write) is never rolled back by a later change of
// access: the guard runs once, at entry.
//
// Automatic and safety-critical operations never go through it: remote
// changes adopted from the sync runner, the push of entries already queued,
// previous-day appointment finalization, local cache writes, session and
// account housekeeping, and the WITHDRAWAL of a communication consent — the
// professional's own (switching reminders or an automation OFF) and a
// client's (an edit that only sets the promotional SMS consent to OPTED_OUT,
// `isClientSmsConsentWithdrawalOnly`, which the server applies without Plus
// too). Each exemption is a narrowly scoped call site, never a public bypass
// flag.
//
// The refusal is thrown, not returned: every provider mutation already
// throws — having changed nothing — when a write is refused, and every
// screen already catches at its call site. A refused mutation can therefore
// never be shown as a successful save. The future centralized read-only
// message / paywall upsell intercepts `BusinessAccessDeniedError` at those
// catch sites (today they all funnel into `alertPersistenceFailure`, the
// natural single connection point); this phase adds no such UI.
//
// Stale closures: the hook returns ONE stable function that reads the latest
// resolved access, so a mutation closure captured earlier still judges by
// the current entitlement after a store push, a deadline or a foreground
// refresh — the protection holds when a function is called programmatically,
// never only because a button is disabled.

import { useCallback, useEffect, useRef } from 'react';

import type { BusinessAccess, ReadOnlyReason } from '@/domain/access';

import { useBusinessAccess } from './session/BusinessAccessProvider';

/**
 * A business mutation refused because access is read-only. Nothing was
 * written, queued, uploaded or changed in memory. `operation` names the
 * refused entry point (`<feature>.<method>`), for diagnostics and the future
 * upsell; `reason` is the domain's reason, for the future read-only message.
 */
export class BusinessAccessDeniedError extends Error {
  readonly operation: string;
  readonly reason: ReadOnlyReason;

  constructor(operation: string, reason: ReadOnlyReason) {
    super(`${operation}: refused, business access is read-only (${reason})`);
    this.name = 'BusinessAccessDeniedError';
    this.operation = operation;
    this.reason = reason;
  }
}

export function isBusinessAccessDeniedError(error: unknown): error is BusinessAccessDeniedError {
  return error instanceof BusinessAccessDeniedError;
}

/**
 * Throws `BusinessAccessDeniedError` unless `access` permits business
 * mutations — the domain's `canMutateBusinessData`: full access, whatever
 * its reason, permits; read-only refuses and says why. Pure.
 */
export function assertBusinessWriteAccess(access: BusinessAccess, operation: string): void {
  if (access.mode === 'full') return;
  throw new BusinessAccessDeniedError(operation, access.reason);
}

/** Refuses `operation` (throws) while business access is read-only; returns otherwise. */
export type BusinessWriteGuard = (operation: string) => void;

/**
 * The guard a business session provider calls at the entry of each
 * user-initiated mutation. Stable across renders; always judges by the
 * latest access the provider resolved.
 */
export function useBusinessWriteGuard(): BusinessWriteGuard {
  const { access } = useBusinessAccess();
  const latest = useRef(access);
  useEffect(() => {
    latest.current = access;
  }, [access]);
  return useCallback((operation: string) => assertBusinessWriteAccess(latest.current, operation), []);
}
