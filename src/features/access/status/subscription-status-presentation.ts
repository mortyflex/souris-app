// BeautIzzy — what the professional reads about her BeautIzzy Plus subscription — pure
//
// From the latest VERIFICATION of the session (`SubscriptionVerification`,
// the store's answer translated by the domain) — never from the access mode,
// never from `canMutate`: with enforcement disabled every account has full
// access, which proves no subscription — the model of the « Mon abonnement »
// section: whether the « BeautIzzy Plus » badge is shown, a status line, the
// plan when the store established it, and one dated detail with accurate
// wording.
//
//   active             badge · « Abonnement actif » · plan · « Période en cours jusqu’au … »
//                      (the end of the paid period: no payment is promised, no renewal guaranteed)
//   trial              badge · « Essai gratuit » · plan · « Fin de l’essai le … »
//   cancelled-active   badge · « Actif jusqu’au … » · plan · « Sans renouvellement automatique. »
//   complimentary      badge · « Accès offert » · « Jusqu’au … » only when an end exists
//   expired, never     no badge · « Aucun abonnement actif » · the policy's own sentence, and —
//                      while enforcement is disabled — that everything stays available
//   pending            no badge · « Vérification de l’abonnement… » (nothing claimed either way)
//   unavailable        no badge · « Abonnement non vérifié » (never "free", never "expired")
//
// A verified entitlement whose end is behind `now` has lapsed
// (`isVerificationCurrent`): its renewal is unverified, so it reads as
// unavailable — never as still active, never as expired. A plan the store did
// not establish (`unknown`: a Test Store product) is simply not written. No
// date is ever invented.
//
// Dates follow the application's convention: `Intl.DateTimeFormat('fr-FR')`,
// day, long month, year — « 21 novembre 2026 ».

import {
  isVerificationCurrent,
  type AccessEnforcement,
  type EntitlementPlan,
  type SubscriptionVerification,
} from '@/domain/access';

import { PLUS_BRAND_NAME } from '../paywall/paywall-copy';
import { describeReadOnlyReason } from '../read-only-copy';

export const SUBSCRIPTION_SECTION_TITLE = 'Mon abonnement';

export const SUBSCRIPTION_STATUS_ACTIVE = 'Abonnement actif';
export const SUBSCRIPTION_STATUS_TRIAL = 'Essai gratuit';
export const SUBSCRIPTION_STATUS_COMPLIMENTARY = 'Accès offert';
export const SUBSCRIPTION_STATUS_NONE = 'Aucun abonnement actif';
export const SUBSCRIPTION_STATUS_PENDING = 'Vérification de l’abonnement…';
export const SUBSCRIPTION_STATUS_UNAVAILABLE = 'Abonnement non vérifié';

export const SUBSCRIPTION_PENDING_DETAIL = 'Un instant, nous vérifions votre abonnement BeautIzzy Plus.';
export const SUBSCRIPTION_UNAVAILABLE_DETAIL = 'Votre abonnement n’a pas pu être vérifié pour le moment.';
export const SUBSCRIPTION_CANCELLED_DETAIL = 'Sans renouvellement automatique.';
/** Enforcement disabled: true for every account, said quietly so an absence never reads as a loss. */
export const SUBSCRIPTION_EVERYTHING_AVAILABLE = 'Toutes les fonctionnalités restent disponibles.';

export const SUBSCRIPTION_PLAN_LABELS = { monthly: 'Mensuel', annual: 'Annuel' } as const;

export type SubscriptionStatusTone =
  /** A verified entitlement: the badge is shown. */
  | 'plus'
  /** Verified: no entitlement. */
  | 'none'
  /** Nothing confirmed yet, or nothing could be confirmed. */
  | 'pending';

export interface SubscriptionStatusModel {
  readonly tone: SubscriptionStatusTone;
  /** Whether the « BeautIzzy Plus » badge is shown: a verified entitlement only. */
  readonly plus: boolean;
  readonly title: string;
  /** « Mensuel » / « Annuel », only when the store established the plan. */
  readonly plan?: string;
  readonly details: readonly string[];
  /** Everything the section says, as one spoken element. */
  readonly accessibilityLabel: string;
}

export interface SubscriptionStatusInput {
  /** The latest answer of the session; undefined while the first one is in flight. */
  readonly verification: SubscriptionVerification | undefined;
  readonly now: Date;
  readonly enforcement: AccessEnforcement;
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * THE rule of every « Plus » cue of the product: whether the latest
 * verification of the session confirms an entitlement in force at `now` —
 * active, trial, cancelled-but-active or complimentary. Pending, unavailable,
 * expired, never and a lapsed entitlement are not Plus. Never derived from
 * the access mode or `canMutate`: with enforcement disabled every account has
 * full access, which proves no subscription.
 */
export function hasVerifiedPlusEntitlement(verification: SubscriptionVerification | undefined, now: Date): boolean {
  if (verification === undefined || verification.kind !== 'verified') return false;
  if (!isVerificationCurrent(verification, now)) return false;
  const { kind } = verification.status;
  return kind === 'active' || kind === 'trial' || kind === 'cancelled-active' || kind === 'complimentary';
}

/** « 21 novembre 2026 », in the device's time zone. */
export function formatSubscriptionDate(date: Date): string {
  return dateFormatter.format(date);
}

function planLabel(plan: EntitlementPlan): string | undefined {
  return plan === 'unknown' ? undefined : SUBSCRIPTION_PLAN_LABELS[plan];
}

function model(
  tone: SubscriptionStatusTone,
  title: string,
  details: readonly string[],
  plan?: string,
): SubscriptionStatusModel {
  const plus = tone === 'plus';
  const spoken = [plus ? PLUS_BRAND_NAME : undefined, title, plan, ...details].filter(
    (part): part is string => part !== undefined,
  );
  return { tone, plus, title, ...(plan === undefined ? {} : { plan }), details, accessibilityLabel: spoken.join(', ') };
}

export function describeSubscriptionStatus({ verification, now, enforcement }: SubscriptionStatusInput): SubscriptionStatusModel {
  if (verification === undefined) return model('pending', SUBSCRIPTION_STATUS_PENDING, [SUBSCRIPTION_PENDING_DETAIL]);
  if (verification.kind === 'unavailable' || !isVerificationCurrent(verification, now)) {
    return model('pending', SUBSCRIPTION_STATUS_UNAVAILABLE, [SUBSCRIPTION_UNAVAILABLE_DETAIL]);
  }

  const { status } = verification;
  const availability = enforcement === 'disabled' ? [SUBSCRIPTION_EVERYTHING_AVAILABLE] : [];
  switch (status.kind) {
    case 'active':
      return model(
        'plus',
        SUBSCRIPTION_STATUS_ACTIVE,
        [`Période en cours jusqu’au ${formatSubscriptionDate(status.expiresAt)}.`],
        planLabel(status.plan),
      );
    case 'trial':
      return model(
        'plus',
        SUBSCRIPTION_STATUS_TRIAL,
        [`Fin de l’essai le ${formatSubscriptionDate(status.expiresAt)}.`],
        planLabel(status.plan),
      );
    case 'cancelled-active':
      return model(
        'plus',
        `Actif jusqu’au ${formatSubscriptionDate(status.expiresAt)}`,
        [SUBSCRIPTION_CANCELLED_DETAIL],
        planLabel(status.plan),
      );
    case 'complimentary':
      return model(
        'plus',
        SUBSCRIPTION_STATUS_COMPLIMENTARY,
        status.expiresAt === undefined ? [] : [`Jusqu’au ${formatSubscriptionDate(status.expiresAt)}.`],
      );
    case 'expired':
      return model('none', SUBSCRIPTION_STATUS_NONE, [describeReadOnlyReason('subscription-expired'), ...availability]);
    case 'never':
      return model('none', SUBSCRIPTION_STATUS_NONE, [describeReadOnlyReason('never-subscribed'), ...availability]);
  }
}
