// Souris — BusinessGateway bound to the Supabase `businesses` table
//
// Row Level Security already scopes every query to the authenticated owner;
// the explicit `owner_user_id` filter keeps the intent visible and the
// contract honest. Rows are converted to the domain BusinessProfile at this
// boundary — remote shapes never leak further.

import type { PostgrestError } from '@supabase/supabase-js';

import { isBusinessActivityType, type BusinessProfile, type BusinessSetupInput } from '@/domain/business';
import { BusinessGateway, BusinessGatewayError } from '@/features/business/gateway';

import type { SourisSupabaseClient } from './client';
import type { BusinessRow } from './database-types';

export type SupabaseBusinessApi = Pick<SourisSupabaseClient, 'from'>;

/** Exported for tests: PostgREST / Postgres error → stable failure code. */
export function mapPostgrestError(error: Pick<PostgrestError, 'code' | 'message'>): BusinessGatewayError {
  switch (error.code) {
    case '23505':
      return new BusinessGatewayError('ALREADY_EXISTS');
    case '42501':
      return new BusinessGatewayError('FORBIDDEN');
    case '23502':
    case '23514':
    case '22P02':
      return new BusinessGatewayError('INVALID');
    case '':
    case undefined:
      // postgrest-js reports a failed fetch (no network) with an empty code.
      return new BusinessGatewayError('NETWORK');
    default:
      return /network request failed|failed to fetch|fetch failed/i.test(error.message)
        ? new BusinessGatewayError('NETWORK')
        : new BusinessGatewayError('UNKNOWN');
  }
}

function toInstant(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessGatewayError('INVALID', `Invalid remote timestamp "${value}"`);
  }
  return date;
}

/** Exported for tests: remote row → domain profile, validating the activity vocabulary. */
export function toBusinessProfile(row: BusinessRow): BusinessProfile {
  if (!isBusinessActivityType(row.activity_type)) {
    throw new BusinessGatewayError('INVALID', `Unknown activity_type "${row.activity_type}"`);
  }
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerFirstName: row.owner_first_name,
    ...(row.owner_last_name !== null && { ownerLastName: row.owner_last_name }),
    name: row.name,
    activityType: row.activity_type,
    ...(row.phone !== null && { phone: row.phone }),
    createdAt: toInstant(row.created_at),
    updatedAt: toInstant(row.updated_at),
  };
}

export function createSupabaseBusinessGateway(client: SupabaseBusinessApi): BusinessGateway {
  return {
    async listOwnedBusinesses(ownerUserId: string): Promise<readonly BusinessProfile[]> {
      const { data, error } = await client
        .from('businesses')
        .select('*')
        .eq('owner_user_id', ownerUserId)
        .order('created_at', { ascending: true });
      if (error) throw mapPostgrestError(error);
      return data.map(toBusinessProfile);
    },

    async createBusiness(ownerUserId: string, input: BusinessSetupInput): Promise<BusinessProfile> {
      const { data, error } = await client
        .from('businesses')
        .insert({
          owner_user_id: ownerUserId,
          owner_first_name: input.ownerFirstName,
          owner_last_name: input.ownerLastName ?? null,
          name: input.name,
          activity_type: input.activityType,
          phone: input.phone ?? null,
        })
        .select('*')
        .single();
      if (error) throw mapPostgrestError(error);
      return toBusinessProfile(data);
    },
  };
}
