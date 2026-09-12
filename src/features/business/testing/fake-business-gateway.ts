// Souris — deterministic BusinessGateway for tests (never imported by app code)

import type { BusinessProfile, BusinessSetupInput } from '@/domain/business';

import { BusinessGatewayError, type BusinessFailureCode, type BusinessGateway } from '../gateway';

export const REMOTE_BUSINESS_ID = '8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f';

export function createRemoteBusiness(
  overrides: Partial<BusinessProfile> = {},
): BusinessProfile {
  return {
    id: REMOTE_BUSINESS_ID,
    ownerUserId: 'user-lea',
    ownerFirstName: 'Léa',
    ownerLastName: 'Martin',
    name: 'Maison Léa',
    activityType: 'HAIRDRESSING',
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    ...overrides,
  };
}

export interface FakeBusinessGateway extends BusinessGateway {
  /** The remote table: mutable so tests can shape scenarios. */
  readonly rows: BusinessProfile[];
  /** Makes the next N calls fail with `code` (both operations). */
  failNext(code: BusinessFailureCode, count?: number): void;
  readonly calls: { list: number; create: number };
}

export function createFakeBusinessGateway(initialRows: readonly BusinessProfile[] = []): FakeBusinessGateway {
  const rows = [...initialRows];
  const calls = { list: 0, create: 0 };
  let pendingFailures: { code: BusinessFailureCode; count: number } | undefined;
  let sequence = 0;

  const consumeFailure = () => {
    if (!pendingFailures) return;
    const failure = pendingFailures;
    failure.count -= 1;
    if (failure.count <= 0) pendingFailures = undefined;
    throw new BusinessGatewayError(failure.code);
  };

  return {
    rows,
    calls,
    failNext: (code, count = 1) => {
      pendingFailures = { code, count };
    },
    listOwnedBusinesses: async (ownerUserId) => {
      calls.list += 1;
      consumeFailure();
      return rows.filter((row) => row.ownerUserId === ownerUserId);
    },
    createBusiness: async (ownerUserId, input: BusinessSetupInput) => {
      calls.create += 1;
      consumeFailure();
      if (rows.some((row) => row.ownerUserId === ownerUserId)) {
        throw new BusinessGatewayError('ALREADY_EXISTS');
      }
      sequence += 1;
      const now = new Date('2026-09-12T10:00:00.000Z');
      const created: BusinessProfile = {
        id: sequence === 1 ? REMOTE_BUSINESS_ID : `${REMOTE_BUSINESS_ID}-${sequence}`,
        ownerUserId,
        ownerFirstName: input.ownerFirstName,
        ...(input.ownerLastName !== undefined && { ownerLastName: input.ownerLastName }),
        name: input.name,
        activityType: input.activityType,
        ...(input.phone !== undefined && { phone: input.phone }),
        createdAt: now,
        updatedAt: now,
      };
      rows.push(created);
      return created;
    },
  };
}
