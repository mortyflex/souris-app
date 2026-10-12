// BeautIzzy — Business identity (domain)
//
// A Business is the owner boundary of every operational record (Services,
// Appointments, Products, Sales carry its `businessId`). V1 relationship:
// one authenticated owner ↔ one Business. Staff, memberships, and
// multi-business selection are future concerns; the identifiers stay
// explicit so they remain cheap to add later.

/**
 * Stable, storage-facing vocabulary of what the professional does — ONE
 * primary activity per Business. Persisted as-is (remote and local); French
 * labels are presentation only. The onboarding grid orders these its own
 * way (`src/features/business/setup/activity-options.ts`).
 */
export const BUSINESS_ACTIVITY_TYPES = [
  'HAIRDRESSING',
  'BARBER',
  'NAILS',
  'ESTHETICS',
  'LASHES_BROWS',
  'MAKEUP',
  'WELLNESS',
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
 * Decodes a STORED activity value at a boundary (remote row, local row). A
 * known value is kept as is; anything else — typically a value introduced by
 * a newer build — reads as `OTHER`, so an older build never fails to open a
 * Business it cannot name. The stored remote value is never rewritten by
 * the app, so nothing is lost: a build that knows the value reads it again.
 */
export function toBusinessActivityType(value: unknown): BusinessActivityType {
  return isBusinessActivityType(value) ? value : 'OTHER';
}

/**
 * The Business as the application knows it — cached locally so BeautIzzy opens
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
