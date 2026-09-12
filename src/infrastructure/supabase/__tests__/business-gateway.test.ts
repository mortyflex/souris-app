import { BusinessGatewayError } from '@/features/business/gateway';

import {
  createSupabaseBusinessGateway,
  mapPostgrestError,
  toBusinessProfile,
  type SupabaseBusinessApi,
} from '../business-gateway';
import type { BusinessRow } from '../database-types';

const row: BusinessRow = {
  id: '8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f',
  owner_user_id: 'user-lea',
  owner_first_name: 'Léa',
  owner_last_name: null,
  name: 'Maison Léa',
  activity_type: 'NAILS',
  phone: '06 12 34 56 78',
  created_at: '2026-09-12T10:00:00.000Z',
  updated_at: '2026-09-12T10:00:00.000Z',
};

interface FakeQuery {
  readonly select: jest.Mock;
  readonly eq: jest.Mock;
  readonly order: jest.Mock;
  readonly insert: jest.Mock;
  readonly single: jest.Mock;
}

function createClient(result: { data: unknown; error: unknown }): { client: SupabaseBusinessApi; query: FakeQuery } {
  const query: FakeQuery = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(async () => result),
    insert: jest.fn(() => query),
    single: jest.fn(async () => result),
  };
  const client = { from: jest.fn(() => query) } as unknown as SupabaseBusinessApi;
  return { client, query };
}

describe('mapPostgrestError', () => {
  it('maps Postgres and transport failures to stable codes', () => {
    expect(mapPostgrestError({ code: '23505', message: 'duplicate key' }).code).toBe('ALREADY_EXISTS');
    expect(mapPostgrestError({ code: '42501', message: 'rls' }).code).toBe('FORBIDDEN');
    expect(mapPostgrestError({ code: '23514', message: 'check' }).code).toBe('INVALID');
    expect(mapPostgrestError({ code: '', message: 'TypeError: Network request failed' }).code).toBe('NETWORK');
    expect(mapPostgrestError({ code: 'PGRST301', message: 'jwt' }).code).toBe('UNKNOWN');
  });
});

describe('toBusinessProfile', () => {
  it('converts a row and refuses an unknown activity vocabulary', () => {
    expect(toBusinessProfile(row)).toEqual({
      id: row.id,
      ownerUserId: 'user-lea',
      ownerFirstName: 'Léa',
      name: 'Maison Léa',
      activityType: 'NAILS',
      phone: '06 12 34 56 78',
      createdAt: new Date('2026-09-12T10:00:00.000Z'),
      updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    });
    expect(() => toBusinessProfile({ ...row, activity_type: 'Coiffure' })).toThrow(BusinessGatewayError);
  });
});

describe('createSupabaseBusinessGateway', () => {
  it('lists the owner’s businesses through an explicit owner filter', async () => {
    const { client, query } = createClient({ data: [row], error: null });
    const gateway = createSupabaseBusinessGateway(client);

    const businesses = await gateway.listOwnedBusinesses('user-lea');

    expect(businesses.map((business) => business.id)).toEqual([row.id]);
    expect(query.eq).toHaveBeenCalledWith('owner_user_id', 'user-lea');
  });

  it('inserts with the owner id and reports the unique-owner violation as ALREADY_EXISTS', async () => {
    const created = createClient({ data: row, error: null });
    const business = await createSupabaseBusinessGateway(created.client).createBusiness('user-lea', {
      ownerFirstName: 'Léa',
      name: 'Maison Léa',
      activityType: 'NAILS',
      phone: '06 12 34 56 78',
    });
    expect(business.ownerUserId).toBe('user-lea');
    expect(created.query.insert).toHaveBeenCalledWith({
      owner_user_id: 'user-lea',
      owner_first_name: 'Léa',
      owner_last_name: null,
      name: 'Maison Léa',
      activity_type: 'NAILS',
      phone: '06 12 34 56 78',
    });

    const duplicate = createClient({ data: null, error: { code: '23505', message: 'duplicate' } });
    await expect(
      createSupabaseBusinessGateway(duplicate.client).createBusiness('user-lea', {
        ownerFirstName: 'Léa',
        name: 'Maison Léa',
        activityType: 'NAILS',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
  });
});
