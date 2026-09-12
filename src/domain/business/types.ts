// Souris — Business identity (domain)
//
// A Business is the owner boundary of every operational record (Services,
// Appointments, Products, Sales carry its `businessId`). V1 relationship:
// one authenticated owner ↔ one Business. Staff, memberships, and
// multi-business selection are future concerns; the identifiers stay
// explicit so they remain cheap to add later.

/**
 * Stable, storage-facing vocabulary of what the professional does. Persisted
 * as-is (remote and local); French labels are presentation only.
 */
export const BUSINESS_ACTIVITY_TYPES = [
  'HAIRDRESSING',
  'BARBER',
  'NAILS',
  'ESTHETICS',
  'LASHES_BROWS',
  'OTHER',
] as const;

export type BusinessActivityType = (typeof BUSINESS_ACTIVITY_TYPES)[number];

export function isBusinessActivityType(value: unknown): value is BusinessActivityType {
  return (
    typeof value === 'string' &&
    (BUSINESS_ACTIVITY_TYPES as readonly string[]).includes(value)
  );
}

/**
 * The Business as the application knows it — cached locally so Souris opens
 * offline once onboarding completed. The owner's email is Auth identity and
 * is deliberately not duplicated here.
 */
export interface BusinessProfile {
  readonly id: string;
  readonly ownerUserId: string;
  readonly ownerFirstName: string;
  readonly ownerLastName?: string;
  readonly name: string;
  readonly activityType: BusinessActivityType;
  readonly phone?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What the owner provides during Business setup; identity and timestamps are assigned remotely. */
export interface BusinessSetupInput {
  readonly ownerFirstName: string;
  readonly ownerLastName?: string;
  readonly name: string;
  readonly activityType: BusinessActivityType;
  readonly phone?: string;
}
