// BeautIzzy — deterministic subscription verifications for TESTS and the
// development status preview — never imported by product code, never fed to
// BusinessAccessProvider: they describe what a store COULD answer, so the
// status card can be seen in every state without any real entitlement.

import type { SubscriptionVerification } from '@/domain/access';

export const STATUS_FIXTURE_NOW = new Date('2026-10-21T10:00:00.000Z');
export const STATUS_FIXTURE_END = new Date('2026-11-21T10:00:00.000Z');
export const STATUS_FIXTURE_FAR_END = new Date('2027-10-21T10:00:00.000Z');

export interface SubscriptionStatusScenario {
  readonly key: string;
  readonly title: string;
  /** Undefined: the first verification of the session is still pending. */
  readonly verification: SubscriptionVerification | undefined;
}

const verified = (status: Extract<SubscriptionVerification, { kind: 'verified' }>['status']): SubscriptionVerification => ({
  kind: 'verified',
  status,
});

/** The scenarios of the development preview, in the order they are listed. */
export const subscriptionStatusScenarios: readonly SubscriptionStatusScenario[] = [
  { key: 'active-monthly', title: 'Actif — mensuel', verification: verified({ kind: 'active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }) },
  { key: 'active-annual', title: 'Actif — annuel', verification: verified({ kind: 'active', plan: 'annual', expiresAt: STATUS_FIXTURE_FAR_END }) },
  { key: 'active-unknown-plan', title: 'Actif — formule inconnue (Test Store)', verification: verified({ kind: 'active', plan: 'unknown', expiresAt: STATUS_FIXTURE_END }) },
  { key: 'trial', title: 'Essai gratuit', verification: verified({ kind: 'trial', plan: 'annual', expiresAt: STATUS_FIXTURE_END }) },
  { key: 'cancelled-active', title: 'Résilié, encore actif', verification: verified({ kind: 'cancelled-active', plan: 'monthly', expiresAt: STATUS_FIXTURE_END }) },
  { key: 'complimentary', title: 'Accès offert — sans fin', verification: verified({ kind: 'complimentary' }) },
  { key: 'complimentary-expiring', title: 'Accès offert — jusqu’à une date', verification: verified({ kind: 'complimentary', expiresAt: STATUS_FIXTURE_FAR_END }) },
  { key: 'expired', title: 'Expiré', verification: verified({ kind: 'expired' }) },
  { key: 'never', title: 'Jamais abonné', verification: verified({ kind: 'never' }) },
  { key: 'unavailable', title: 'Vérification indisponible', verification: { kind: 'unavailable' } },
  { key: 'pending', title: 'Vérification en cours', verification: undefined },
];
