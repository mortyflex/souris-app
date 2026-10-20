// BeautIzzy — paywall presentation rules (BeautIzzy Plus) — pure
//
// From a store offering (`PaywallOffering`) and the screen's context, the
// model the paywall components draw: plan cards, the preselected plan, the
// primary action and the contextual notices. The components consume it and
// invent no rule of their own.
//
//   plans        the valid offers only (a finite positive amount, a currency
//                code, a whole positive trial length), one per plan, annual
//                first; an invalid offer is dropped, never shown with a
//                phantom price;
//   default      annual when offered, otherwise the only plan;
//   recommended  the annual plan, only when BOTH plans are offered: the
//                badge compares, it never claims alone;
//   savings      « Économisez n % » only when both plans share a currency and
//                the annual price is really under twelve monthly ones;
//   equivalent   « soit 10,75 € par mois » for the annual plan: the annual
//                price over twelve, nothing more;
//   trial        shown only for an offer the store marked ELIGIBLE;
//   action       subscribe when a valid plan is selected AND a purchase entry
//                point exists; otherwise disabled and said so. An unavailable
//                offering has no action at all: nothing can be initiated.
//
// Formatting follows the store's own localized string when it provides one,
// `Intl.NumberFormat` for the given locale and currency otherwise. No price
// is written in this module.

import type { ReadOnlyReason, SubscriptionPlan } from '@/domain/access';

import { describeReadOnlyReason } from '../read-only-copy';
import {
  PAYWALL_CONTINUE_TITLE,
  PAYWALL_ENTITLED_LEAD,
  PAYWALL_ENTITLED_TITLE,
  PAYWALL_EXPLORE_CAPTION,
  PAYWALL_EXPLORE_LABEL,
  PAYWALL_EXPLORE_TITLE,
  PAYWALL_HEADLINE,
  PAYWALL_INITIAL_LEAD,
  PAYWALL_LOADING_TITLE,
  PAYWALL_NOT_CONFIGURED_FOOTNOTE,
  PAYWALL_PLAN_PERIODS,
  PAYWALL_PLAN_SPOKEN,
  PAYWALL_PLAN_TITLES,
  PAYWALL_READ_ONLY_NOTICE_DETAIL,
  PAYWALL_READ_ONLY_NOTICE_TITLE,
  PAYWALL_RECOMMENDED_SPOKEN,
  PAYWALL_RETURN_TITLE,
  PAYWALL_SUBSCRIBE_TITLE,
  PAYWALL_VERIFYING_NOTICE_DETAIL,
  PAYWALL_VERIFYING_NOTICE_TITLE,
} from './paywall-copy';
import type { PaywallOffering, PaywallPlanOffer, PaywallPrice } from './paywall-offering';

export const PAYWALL_DEFAULT_LOCALE = 'fr-FR';

/** Annual first: the recommended plan leads. */
const PLAN_ORDER: readonly SubscriptionPlan[] = ['annual', 'monthly'];

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function isValidPlanOffer(offer: PaywallPlanOffer): boolean {
  const { amount, currencyCode } = offer.price;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (!CURRENCY_CODE.test(currencyCode)) return false;
  if (offer.freeTrial !== undefined) {
    const { days } = offer.freeTrial;
    if (!Number.isInteger(days) || days <= 0) return false;
  }
  return true;
}

/** The store's string when it has one; otherwise the locale's currency format, cents only when there are some. */
export function formatPaywallPrice(price: PaywallPrice, locale: string): string {
  if (price.formatted) return price.formatted;
  return formatAmount(price.amount, price.currencyCode, locale);
}

function formatAmount(amount: number, currencyCode: string, locale: string): string {
  const fraction = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    currency: currencyCode,
    maximumFractionDigits: 2,
    minimumFractionDigits: fraction,
    style: 'currency',
  }).format(amount);
}

/**
 * The whole percentage the annual plan saves over twelve monthly payments,
 * or undefined when the two are not comparable (different currencies) or
 * the annual plan saves nothing.
 */
export function resolveAnnualSavingsPercent(monthly: PaywallPrice, annual: PaywallPrice): number | undefined {
  if (monthly.currencyCode !== annual.currencyCode) return undefined;
  const yearlyAtMonthly = monthly.amount * 12;
  if (!(yearlyAtMonthly > 0) || !(annual.amount > 0)) return undefined;
  const percent = Math.round((1 - annual.amount / yearlyAtMonthly) * 100);
  return percent >= 1 ? percent : undefined;
}

export interface PaywallPlanCardModel {
  readonly plan: SubscriptionPlan;
  readonly title: string;
  /** The formatted store price, « 99 € » or « 9,99 € ». */
  readonly price: string;
  /** « par an » */
  readonly period: string;
  /** Annual only: « soit 10,75 € par mois ». */
  readonly equivalent?: string;
  /** « Économisez 17 % », only when mathematically valid and comparable. */
  readonly savings?: string;
  /** « n jours gratuits », only for an offer the store marked eligible. */
  readonly trial?: string;
  readonly trialDays?: number;
  readonly recommended: boolean;
  readonly accessibilityLabel: string;
}

export type PaywallPlansUnavailableReason = 'not-configured' | 'store-unavailable' | 'no-valid-plan';

export type PaywallPlansModel =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable'; readonly reason: PaywallPlansUnavailableReason }
  | {
      readonly status: 'available';
      readonly cards: readonly PaywallPlanCardModel[];
      readonly defaultPlan: SubscriptionPlan;
    };

function validOffersByPlan(offers: readonly PaywallPlanOffer[]): Map<SubscriptionPlan, PaywallPlanOffer> {
  const byPlan = new Map<SubscriptionPlan, PaywallPlanOffer>();
  for (const offer of offers) {
    if (!isValidPlanOffer(offer) || byPlan.has(offer.plan)) continue;
    byPlan.set(offer.plan, offer);
  }
  return byPlan;
}

function formatTrial(days: number): string {
  return `${days} jour${days > 1 ? 's' : ''} gratuit${days > 1 ? 's' : ''}`;
}

function buildCard(
  offer: PaywallPlanOffer,
  options: { readonly recommended: boolean; readonly savingsPercent: number | undefined },
  locale: string,
): PaywallPlanCardModel {
  const price = formatPaywallPrice(offer.price, locale);
  const period = PAYWALL_PLAN_PERIODS[offer.plan];
  const equivalent =
    offer.plan === 'annual'
      ? `soit ${formatAmount(offer.price.amount / 12, offer.price.currencyCode, locale)} par mois`
      : undefined;
  const savings =
    offer.plan === 'annual' && options.savingsPercent !== undefined ? `Économisez ${options.savingsPercent} %` : undefined;
  const eligibleTrial = offer.freeTrial?.eligibility === 'eligible' ? offer.freeTrial : undefined;
  const trial = eligibleTrial ? formatTrial(eligibleTrial.days) : undefined;
  const spoken = [
    PAYWALL_PLAN_SPOKEN[offer.plan],
    `${price} ${period}`,
    equivalent,
    savings,
    trial,
    options.recommended ? PAYWALL_RECOMMENDED_SPOKEN : undefined,
  ].filter((part): part is string => part !== undefined);

  return {
    plan: offer.plan,
    title: PAYWALL_PLAN_TITLES[offer.plan],
    price,
    period,
    equivalent,
    savings,
    trial,
    trialDays: eligibleTrial?.days,
    recommended: options.recommended,
    accessibilityLabel: spoken.join(', '),
  };
}

export function buildPaywallPlans(offering: PaywallOffering, locale = PAYWALL_DEFAULT_LOCALE): PaywallPlansModel {
  if (offering.status === 'loading') return { status: 'loading' };
  if (offering.status === 'unavailable') return { status: 'unavailable', reason: offering.reason };

  const byPlan = validOffersByPlan(offering.plans);
  const annual = byPlan.get('annual');
  const monthly = byPlan.get('monthly');
  if (annual === undefined && monthly === undefined) return { status: 'unavailable', reason: 'no-valid-plan' };

  const both = annual !== undefined && monthly !== undefined;
  const savingsPercent = both ? resolveAnnualSavingsPercent(monthly.price, annual.price) : undefined;
  const cards = PLAN_ORDER.flatMap((plan) => {
    const offer = byPlan.get(plan);
    if (offer === undefined) return [];
    return [buildCard(offer, { recommended: both && plan === 'annual', savingsPercent }, locale)];
  });
  return { status: 'available', cards, defaultPlan: annual !== undefined ? 'annual' : 'monthly' };
}

/** The selected plan when it is offered, the default otherwise. */
export function resolveSelectedPaywallPlan(
  plans: PaywallPlansModel,
  requested: SubscriptionPlan | undefined,
): SubscriptionPlan | undefined {
  if (plans.status !== 'available') return undefined;
  if (requested !== undefined && plans.cards.some((card) => card.plan === requested)) return requested;
  return plans.defaultPlan;
}

export type PaywallActionModel =
  /** A valid plan is selected and a purchase entry point exists. */
  | { readonly kind: 'subscribe'; readonly plan: SubscriptionPlan; readonly title: string; readonly footnote: string }
  /** The store is being asked: a disabled action that says so. */
  | { readonly kind: 'loading'; readonly title: string }
  /** Plans exist but no purchase integration does: a disabled action that says so. */
  | { readonly kind: 'not-configured'; readonly title: string; readonly footnote: string }
  /** Nothing can be initiated. */
  | { readonly kind: 'none' };

export function resolvePaywallAction(
  plans: PaywallPlansModel,
  selectedPlan: SubscriptionPlan | undefined,
  purchasable: boolean,
): PaywallActionModel {
  if (plans.status === 'loading') return { kind: 'loading', title: PAYWALL_LOADING_TITLE };
  if (plans.status === 'unavailable') return { kind: 'none' };
  const card = plans.cards.find((candidate) => candidate.plan === selectedPlan);
  if (card === undefined) return { kind: 'none' };
  if (!purchasable) {
    return { kind: 'not-configured', title: PAYWALL_SUBSCRIBE_TITLE, footnote: PAYWALL_NOT_CONFIGURED_FOOTNOTE };
  }
  if (card.trialDays !== undefined) {
    return {
      kind: 'subscribe',
      plan: card.plan,
      title: `Essayer gratuitement ${card.trialDays} jour${card.trialDays > 1 ? 's' : ''}`,
      footnote: `Puis ${card.price} ${card.period}.`,
    };
  }
  return { kind: 'subscribe', plan: card.plan, title: PAYWALL_SUBSCRIBE_TITLE, footnote: `${card.price} ${card.period}.` };
}

/**
 * Why the paywall is shown. The caller decides (the future account-scoped
 * routing); the presentation only adapts its copy and what it offers.
 */
export type PaywallContext =
  /** Business setup just completed: the first offer, with the read-only exploration. */
  | { readonly kind: 'initial-offer' }
  /** An existing account whose access is read-only, for the policy's reason. */
  | { readonly kind: 'read-only'; readonly reason: ReadOnlyReason }
  /** A returning subscriber with an active entitlement: nothing to sell. */
  | { readonly kind: 'entitled' }
  /** The first verification of the session is still pending: no claim either way. */
  | { readonly kind: 'verifying' };

export interface PaywallNoticeModel {
  readonly tone: 'reassuring' | 'pending';
  readonly title: string;
  readonly lines: readonly string[];
}

export interface PaywallSecondaryAction {
  /** `explore` and `return` enter (or go back to) read-only use; `continue` simply leaves the screen. */
  readonly kind: 'explore' | 'return' | 'continue';
  readonly title: string;
  readonly accessibilityLabel?: string;
  /** A quiet line under the action (the read-only limit of « Explorer sans abonnement »). */
  readonly caption?: string;
}

export interface PaywallContextModel {
  readonly title: string;
  readonly lead?: string;
  readonly notice?: PaywallNoticeModel;
  /** Plans and the primary action. */
  readonly showsOffer: boolean;
  readonly showsBenefits: boolean;
  readonly secondaryAction: PaywallSecondaryAction;
}

export function describePaywallContext(context: PaywallContext): PaywallContextModel {
  switch (context.kind) {
    case 'initial-offer':
      return {
        title: PAYWALL_HEADLINE,
        lead: PAYWALL_INITIAL_LEAD,
        showsOffer: true,
        showsBenefits: true,
        secondaryAction: {
          kind: 'explore',
          title: PAYWALL_EXPLORE_TITLE,
          accessibilityLabel: PAYWALL_EXPLORE_LABEL,
          caption: PAYWALL_EXPLORE_CAPTION,
        },
      };
    case 'read-only':
      return {
        title: PAYWALL_HEADLINE,
        notice: {
          tone: 'reassuring',
          title: PAYWALL_READ_ONLY_NOTICE_TITLE,
          lines: [describeReadOnlyReason(context.reason), PAYWALL_READ_ONLY_NOTICE_DETAIL],
        },
        showsOffer: true,
        showsBenefits: true,
        secondaryAction: { kind: 'return', title: PAYWALL_RETURN_TITLE },
      };
    case 'entitled':
      return {
        title: PAYWALL_ENTITLED_TITLE,
        lead: PAYWALL_ENTITLED_LEAD,
        showsOffer: false,
        showsBenefits: false,
        secondaryAction: { kind: 'continue', title: PAYWALL_CONTINUE_TITLE },
      };
    case 'verifying':
      return {
        title: PAYWALL_HEADLINE,
        notice: {
          tone: 'pending',
          title: PAYWALL_VERIFYING_NOTICE_TITLE,
          lines: [PAYWALL_VERIFYING_NOTICE_DETAIL],
        },
        showsOffer: false,
        showsBenefits: true,
        secondaryAction: { kind: 'continue', title: PAYWALL_CONTINUE_TITLE },
      };
  }
}

/** Window heights at or under this are a small phone (iPhone SE: 667). */
export const PAYWALL_SMALL_WINDOW_HEIGHT = 700;

/**
 * Side of the square illustration: about 15 % of the window height — an
 * accent above the headline, never the hero — bounded on each class of
 * phone (112–150 pt on a regular one, so a Pro Max never inflates it;
 * 92–112 pt on a small one), so the plan cards reach the first viewport.
 */
export function resolvePaywallIllustrationSide(windowHeight: number): number {
  const share = windowHeight * 0.15;
  if (windowHeight <= PAYWALL_SMALL_WINDOW_HEIGHT) {
    return Math.round(Math.min(112, Math.max(92, share)));
  }
  return Math.round(Math.min(150, Math.max(112, share)));
}
