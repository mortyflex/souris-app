// Souris — remote Business boundary (domain-facing)
//
// The account-level remote model: ONE Business per authenticated owner.
// Production binds it to the Supabase `businesses` table (RLS-scoped to the
// owner); tests bind it to a deterministic fake. Operational data is NOT
// part of this contract — cloud sync is a later milestone.

import type { BusinessProfile, BusinessSetupInput } from '@/domain/business';

export type BusinessFailureCode =
  | 'NETWORK'
  /** The owner already has a Business (unique owner_user_id); look it up instead. */
  | 'ALREADY_EXISTS'
  /** Row Level Security refused the operation. */
  | 'FORBIDDEN'
  | 'INVALID'
  | 'UNKNOWN';

export class BusinessGatewayError extends Error {
  readonly code: BusinessFailureCode;

  constructor(code: BusinessFailureCode, message = `Business gateway failure: ${code}`) {
    super(message);
    this.name = 'BusinessGatewayError';
    this.code = code;
  }
}

export interface BusinessGateway {
  /** Every Business owned by `ownerUserId` (expected: zero or one). Throws `BusinessGatewayError`. */
  listOwnedBusinesses(ownerUserId: string): Promise<readonly BusinessProfile[]>;
  /** Creates the owner's Business. Throws `BusinessGatewayError` (`ALREADY_EXISTS` on the unique owner). */
  createBusiness(ownerUserId: string, input: BusinessSetupInput): Promise<BusinessProfile>;
}
