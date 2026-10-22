// BeautIzzy — RevenueCat offerings → PaywallOffering — pure
//
// THE translation of what RevenueCat sells the identified user into the
// paywall's vocabulary (`features/access/paywall/paywall-offering.ts`). It
// reads the documented SDK fields and nothing else; every figure it hands
// over — product identifier, amount, currency, localized price string,
// billing period, introductory period — comes from the store product the SDK
// returned. Nothing is invented: no fixture price, no default plan, no trial
// assumed from the dashboard.
//
// Offering. `offerings.current` — the offering the dashboard targets at this
// user — so a dashboard change takes effect without a release. No current
// offering, or one without a usable package, is an EMPTY available offering
// (the store answered: nothing is sold), never a fabricated plan.
//
// Plans. The two BeautIzzy Plus plans are the predefined RevenueCat packages
// `$rc_monthly` and `$rc_annual`, read through the offering's own `monthly`
// and `annual` slots and confirmed by their package type. Nothing is read
// from the array order, a price, a title or a localized name. A package whose
// product carries a billing period that contradicts the plan (a yearly
// product in the monthly package) is dropped: a wrong period would mislead.
//
// Price. `price` (a decimal in major units), `currencyCode` (ISO 4217) and
// `priceString` (the store's localized string) are validated before they
// enter the paywall model; an unusable product drops its plan.
//
// Trial. A product has a free trial only when its `introPrice` exists AND is
// free (`price === 0`): a paid introductory price is a discount, never a
// trial, and produces no trial at all. Its length is the store's period —
// unit and count, multiplied by the number of cycles. Whether THIS user may
// take it is the SDK's eligibility answer for that product identifier:
// ELIGIBLE → eligible; INELIGIBLE → ineligible; UNKNOWN, a contradictory
// NO_INTRO_OFFER_EXISTS, a missing entry or a failed check → unknown. Only
// `eligible` is ever advertised (the presentation rules decide).

import type { SubscriptionPlan } from '@/domain/access';
import type {
  PaywallFreeTrial,
  PaywallPlanOffer,
  PaywallTrialEligibility,
  PaywallTrialPeriod,
  PaywallTrialPeriodUnit,
  StorePaywallOffering,
} from '@/features/access/paywall/paywall-offering';

import {
  INTRO_ELIGIBILITY_STATUS,
  PACKAGE_TYPE,
  type IntroEligibilityByProduct,
  type PurchasesIntroPrice,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from './sdk';

/** The predefined RevenueCat package identifiers of the two plans. */
export const PLUS_PACKAGE_IDENTIFIERS: Readonly<Record<SubscriptionPlan, string>> = {
  monthly: '$rc_monthly',
  annual: '$rc_annual',
};

const PLAN_PACKAGE_TYPE: Readonly<Record<SubscriptionPlan, PACKAGE_TYPE>> = {
  monthly: PACKAGE_TYPE.MONTHLY,
  annual: PACKAGE_TYPE.ANNUAL,
};

/** The ISO 8601 billing period each plan's product must carry, when the store reports one. */
const PLAN_BILLING_PERIOD: Readonly<Record<SubscriptionPlan, string>> = {
  monthly: 'P1M',
  annual: 'P1Y',
};

const CURRENCY_CODE = /^[A-Z]{3}$/;

const PERIOD_UNITS: Readonly<Record<string, PaywallTrialPeriodUnit>> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** The free period of an introductory offer, or undefined when it is paid or malformed. */
export function freePeriodOfIntroductoryOffer(introPrice: PurchasesIntroPrice | null | undefined): PaywallTrialPeriod | undefined {
  if (!isRecord(introPrice)) return undefined;
  if (introPrice.price !== 0) return undefined;
  const unit = typeof introPrice.periodUnit === 'string' ? PERIOD_UNITS[introPrice.periodUnit] : undefined;
  if (unit === undefined) return undefined;
  if (!isPositiveInteger(introPrice.periodNumberOfUnits) || !isPositiveInteger(introPrice.cycles)) return undefined;
  return { unit, count: introPrice.periodNumberOfUnits * introPrice.cycles };
}

/** Whether the product carries a FREE introductory offer, whoever may take it. */
export function hasFreeTrial(product: PurchasesStoreProduct): boolean {
  return freePeriodOfIntroductoryOffer(product.introPrice) !== undefined;
}

/** What the SDK's eligibility answer says for one product; anything but a definite answer is unknown. */
export function trialEligibilityOf(
  productIdentifier: string,
  eligibility: IntroEligibilityByProduct | undefined,
): PaywallTrialEligibility {
  const entry = eligibility?.[productIdentifier];
  if (!isRecord(entry)) return 'unknown';
  switch (entry.status) {
    case INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE:
      return 'eligible';
    case INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE:
      return 'ineligible';
    default:
      return 'unknown';
  }
}

export function freeTrialOf(
  product: PurchasesStoreProduct,
  eligibility: IntroEligibilityByProduct | undefined,
): PaywallFreeTrial | undefined {
  const period = freePeriodOfIntroductoryOffer(product.introPrice);
  if (period === undefined) return undefined;
  return { period, eligibility: trialEligibilityOf(product.identifier, eligibility) };
}

/** The plan offer of one package, or undefined when the package or its product cannot be trusted. */
export function planOfferOf(
  plan: SubscriptionPlan,
  pkg: PurchasesPackage | null | undefined,
  eligibility: IntroEligibilityByProduct | undefined,
): PaywallPlanOffer | undefined {
  if (!isRecord(pkg) || pkg.packageType !== PLAN_PACKAGE_TYPE[plan]) return undefined;
  const product = pkg.product;
  if (!isRecord(product)) return undefined;
  if (nonEmptyString(product.identifier) === undefined) return undefined;
  const { price, currencyCode, subscriptionPeriod } = product;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return undefined;
  if (typeof currencyCode !== 'string' || !CURRENCY_CODE.test(currencyCode)) return undefined;
  if (typeof subscriptionPeriod === 'string' && subscriptionPeriod !== PLAN_BILLING_PERIOD[plan]) return undefined;

  const formatted = nonEmptyString(product.priceString);
  const freeTrial = freeTrialOf(product, eligibility);
  return {
    plan,
    price: formatted === undefined ? { amount: price, currencyCode } : { amount: price, currencyCode, formatted },
    ...(freeTrial === undefined ? {} : { freeTrial }),
  };
}

/** The product identifiers of the current offering whose product carries a free trial: the ones worth an eligibility check. */
export function productIdentifiersWithFreeTrial(offering: PurchasesOffering | null | undefined): readonly string[] {
  if (!isRecord(offering)) return [];
  const identifiers: string[] = [];
  for (const plan of ['annual', 'monthly'] as const) {
    const pkg = offering[plan];
    if (!isRecord(pkg) || !isRecord(pkg.product)) continue;
    const identifier = nonEmptyString(pkg.product.identifier);
    if (identifier !== undefined && hasFreeTrial(pkg.product) && !identifiers.includes(identifier)) {
      identifiers.push(identifier);
    }
  }
  return identifiers;
}

/**
 * The store packages behind the plans of a mapped offering: for each plan
 * listed in `plans`, the very package object of the offering's own slot —
 * the one `planOfferOf` validated and the paywall priced. A purchase hands
 * this object back to the SDK unchanged; nothing is rebuilt from an
 * identifier, a price or a position.
 */
export function selectPlanPackages(
  offerings: PurchasesOfferings,
  plans: readonly PaywallPlanOffer[],
): Partial<Record<SubscriptionPlan, PurchasesPackage>> {
  const current = isRecord(offerings) ? offerings.current : undefined;
  if (!isRecord(current)) return {};
  const packages: Partial<Record<SubscriptionPlan, PurchasesPackage>> = {};
  for (const offer of plans) {
    const pkg = current[offer.plan];
    if (isRecord(pkg) && pkg.packageType === PLAN_PACKAGE_TYPE[offer.plan]) packages[offer.plan] = pkg;
  }
  return packages;
}

/**
 * The paywall offering of the current RevenueCat offering. Always
 * `available`: the store answered. Missing, malformed or contradictory
 * packages are simply absent from `plans`; none at all is an empty list.
 */
export function mapOfferingsToPaywallOffering(
  offerings: PurchasesOfferings,
  eligibility: IntroEligibilityByProduct | undefined,
): StorePaywallOffering {
  const current = isRecord(offerings) ? offerings.current : undefined;
  if (!isRecord(current)) return { status: 'available', plans: [] };
  const plans: PaywallPlanOffer[] = [];
  const annual = planOfferOf('annual', current.annual, eligibility);
  if (annual !== undefined) plans.push(annual);
  const monthly = planOfferOf('monthly', current.monthly, eligibility);
  if (monthly !== undefined) plans.push(monthly);
  return { status: 'available', plans };
}
