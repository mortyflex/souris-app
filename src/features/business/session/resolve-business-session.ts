// Souris — Business resolution for an authenticated owner (pure orchestration)
//
//   local binding present
//     ├─ same owner       → ready (no network needed: offline launches work)
//     └─ other owner      → DEVICE_ACCOUNT_CONFLICT (nothing shown, nothing rebound, nothing wiped)
//   no local binding
//     ├─ offline          → error NETWORK (first connection needs the remote lookup)
//     └─ remote lookup    → zero: setup required
//                           one: bind locally (existing rows adopt its id) → ready
//                           more: invariant violation → error
//
// Binding writes to SQLite first; the caller reflects `ready` only after the
// transaction committed.

import type { BusinessProfile } from '@/domain/business';
import type { SourisDatabase } from '@/persistence/database';
import {
  bindLocalDatabaseToBusiness,
  LocalAccountBindingError,
  readBusinessProfile,
} from '@/persistence/stores/business-profile';

import { BusinessGatewayError, type BusinessGateway } from '../gateway';

export type BusinessSessionFailureCode =
  | 'NETWORK'
  /** More than one remote Business for one owner: refused rather than guessed. */
  | 'MULTIPLE_REMOTE_BUSINESSES'
  /** The remote Business is not owned by the signed-in user. */
  | 'OWNER_MISMATCH'
  /** Local rows reference several business ids; binding refuses to merge them. */
  | 'LOCAL_DATA_CONFLICT'
  | 'FORBIDDEN'
  | 'UNKNOWN';

export interface BusinessSessionFailure {
  readonly code: BusinessSessionFailureCode;
}

export type ResolvedBusinessSession =
  | { readonly status: 'setup-required' }
  | { readonly status: 'ready'; readonly business: BusinessProfile }
  | { readonly status: 'device-account-conflict'; readonly business: BusinessProfile }
  | { readonly status: 'error'; readonly failure: BusinessSessionFailure };

export interface ResolveBusinessSessionInput {
  readonly database: SourisDatabase;
  readonly gateway: BusinessGateway;
  readonly ownerUserId: string;
  /** The auth session could not be validated; remote calls are pointless. */
  readonly offline: boolean;
}

export function toBusinessSessionFailure(error: unknown): BusinessSessionFailure {
  if (error instanceof LocalAccountBindingError) {
    return error.code === 'ALREADY_BOUND_TO_OTHER_ACCOUNT'
      ? { code: 'OWNER_MISMATCH' }
      : { code: 'LOCAL_DATA_CONFLICT' };
  }
  if (error instanceof BusinessGatewayError) {
    switch (error.code) {
      case 'NETWORK':
        return { code: 'NETWORK' };
      case 'FORBIDDEN':
        return { code: 'FORBIDDEN' };
      default:
        return { code: 'UNKNOWN' };
    }
  }
  return { code: 'UNKNOWN' };
}

/** Binds a remote Business locally, refusing one that is not the owner's. */
export function bindRemoteBusiness(
  database: SourisDatabase,
  ownerUserId: string,
  business: BusinessProfile,
): ResolvedBusinessSession {
  if (business.ownerUserId !== ownerUserId) {
    return { status: 'error', failure: { code: 'OWNER_MISMATCH' } };
  }
  try {
    bindLocalDatabaseToBusiness(database, business);
  } catch (error) {
    return { status: 'error', failure: toBusinessSessionFailure(error) };
  }
  return { status: 'ready', business };
}

export async function resolveBusinessSession({
  database,
  gateway,
  ownerUserId,
  offline,
}: ResolveBusinessSessionInput): Promise<ResolvedBusinessSession> {
  const local = readBusinessProfile(database);
  if (local) {
    return local.ownerUserId === ownerUserId
      ? { status: 'ready', business: local }
      : { status: 'device-account-conflict', business: local };
  }

  if (offline) {
    return { status: 'error', failure: { code: 'NETWORK' } };
  }

  let remote: readonly BusinessProfile[];
  try {
    remote = await gateway.listOwnedBusinesses(ownerUserId);
  } catch (error) {
    return { status: 'error', failure: toBusinessSessionFailure(error) };
  }

  if (remote.length === 0) return { status: 'setup-required' };
  if (remote.length > 1) {
    return { status: 'error', failure: { code: 'MULTIPLE_REMOTE_BUSINESSES' } };
  }
  return bindRemoteBusiness(database, ownerUserId, remote[0]!);
}
