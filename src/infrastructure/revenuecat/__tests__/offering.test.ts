// BeautIzzy — RevenueCat offerings → PaywallOffering: the current offering
// only, the two predefined packages by their slot and type, every figure
// from the store product, a trial only when the introductory offer is FREE
// and its length the store's, eligibility only when the SDK answered it.

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS } from '../customer-info';
import {
  PLUS_PACKAGE_IDENTIFIERS,
  freePeriodOfIntroductoryOffer,
  freeTrialOf,
  mapOfferingsToPaywallOffering,
  planOfferOf,
  productIdentifiersWithFreeTrial,
  selectPlanPackages,
  trialEligibilityOf,
} from '../offering';
import { PACKAGE_TYPE, type PurchasesOfferings } from '../sdk';
import {
  ELIGIBLE,
  INELIGIBLE,
  NO_INTRO_OFFER,
  TEST_STORE_PRODUCT_IDENTIFIERS,
  UNKNOWN_ELIGIBILITY,
  appStoreAnnualProduct,
  appStoreEligibility,
  appStoreMonthlyProduct,
  appStoreOfferings,
  freeIntroductoryPrice,
  offering,
  offerings,
  rcPackage,
  storeProduct,
  testStoreOfferings,
} from '../testing/offering-fixtures';

const MONTHLY_ID = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly;
const ANNUAL_ID = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.annual;

describe('mapOfferingsToPaywallOffering — the current offering', () => {
  it('maps the current offering: annual then monthly, each from its predefined package, with the store figures', () => {
    const result = mapOfferingsToPaywallOffering(appStoreOfferings, appStoreEligibility(ELIGIBLE));
    expect(result).toEqual({
      status: 'available',
      plans: [
        {
          plan: 'annual',
          price: { amount: 99, currencyCode: 'EUR', formatted: '99,00 €' },
          freeTrial: { period: { unit: 'week', count: 2 }, eligibility: 'eligible' },
        },
        {
          plan: 'monthly',
          price: { amount: 9.99, currencyCode: 'EUR', formatted: '9,99 €' },
          freeTrial: { period: { unit: 'week', count: 2 }, eligibility: 'eligible' },
        },
      ],
    });
  });

  it('identifies the plans by the predefined package identifiers of RevenueCat', () => {
    expect(PLUS_PACKAGE_IDENTIFIERS).toEqual({ monthly: '$rc_monthly', annual: '$rc_annual' });
    expect(appStoreOfferings.current!.monthly!.identifier).toBe('$rc_monthly');
    expect(appStoreOfferings.current!.annual!.identifier).toBe('$rc_annual');
  });

  it('maps a Test Store offering alike: other identifiers, other amounts, another currency, no trial', () => {
    const result = mapOfferingsToPaywallOffering(testStoreOfferings, undefined);
    expect(result).toEqual({
      status: 'available',
      plans: [
        { plan: 'annual', price: { amount: 49.99, currencyCode: 'USD', formatted: '$49.99' } },
        { plan: 'monthly', price: { amount: 4.99, currencyCode: 'USD', formatted: '$4.99' } },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(MONTHLY_ID);
    expect(TEST_STORE_PRODUCT_IDENTIFIERS.monthly).not.toBe(MONTHLY_ID);
  });

  it('reads `current` only: another offering in `all` is never sold', () => {
    const other = offering({ identifier: 'promo' });
    const withoutCurrent: PurchasesOfferings = { all: { promo: other }, current: null };
    expect(mapOfferingsToPaywallOffering(withoutCurrent, undefined)).toEqual({ status: 'available', plans: [] });
  });

  it('answers an empty offering — never an invented plan — when the current offering has no usable package', () => {
    expect(mapOfferingsToPaywallOffering(offerings(offering({ monthly: null, annual: null })), undefined)).toEqual({
      status: 'available',
      plans: [],
    });
    expect(mapOfferingsToPaywallOffering(offerings(null), undefined)).toEqual({ status: 'available', plans: [] });
  });

  it('offers the monthly plan alone, or the annual plan alone, when that is all the store sells', () => {
    const monthlyOnly = mapOfferingsToPaywallOffering(offerings(offering({ annual: null })), undefined);
    expect(monthlyOnly.status === 'available' && monthlyOnly.plans.map((plan) => plan.plan)).toEqual(['monthly']);
    const annualOnly = mapOfferingsToPaywallOffering(offerings(offering({ monthly: null })), undefined);
    expect(annualOnly.status === 'available' && annualOnly.plans.map((plan) => plan.plan)).toEqual(['annual']);
  });

  it('ignores a custom package: nothing is inferred from the array of available packages', () => {
    const custom = rcPackage('monthly', storeProduct({ identifier: 'custom', price: 1 }), {
      identifier: 'custom_pack',
      packageType: PACKAGE_TYPE.CUSTOM,
    });
    const result = mapOfferingsToPaywallOffering(
      offerings(offering({ monthly: null, annual: null, otherPackages: [custom] })),
      undefined,
    );
    expect(result).toEqual({ status: 'available', plans: [] });
  });

  it('tolerates a malformed answer without throwing', () => {
    expect(mapOfferingsToPaywallOffering(undefined as unknown as PurchasesOfferings, undefined)).toEqual({
      status: 'available',
      plans: [],
    });
    expect(mapOfferingsToPaywallOffering({ current: 'nope' } as unknown as PurchasesOfferings, undefined)).toEqual({
      status: 'available',
      plans: [],
    });
  });
});

describe('planOfferOf — the store product decides, and is validated', () => {
  it('drops a package whose type does not match the plan slot', () => {
    const annualInMonthlySlot = rcPackage('annual', appStoreAnnualProduct);
    expect(planOfferOf('monthly', annualInMonthlySlot, undefined)).toBeUndefined();
    expect(planOfferOf('annual', annualInMonthlySlot, undefined)).toBeDefined();
  });

  it('drops a product whose billing period contradicts the plan, and accepts an unreported one', () => {
    const yearlyInMonthly = rcPackage('monthly', storeProduct({ subscriptionPeriod: 'P1Y' }));
    expect(planOfferOf('monthly', yearlyInMonthly, undefined)).toBeUndefined();
    const unreported = rcPackage('monthly', storeProduct({ subscriptionPeriod: null }));
    expect(planOfferOf('monthly', unreported, undefined)).toMatchObject({ plan: 'monthly' });
  });

  it.each([
    ['a zero price', storeProduct({ price: 0 })],
    ['a negative price', storeProduct({ price: -1 })],
    ['a NaN price', storeProduct({ price: Number.NaN })],
    ['a non-numeric price', storeProduct({ price: '9.99' as unknown as number })],
    ['a malformed currency', storeProduct({ currencyCode: 'euro' })],
    ['an empty currency', storeProduct({ currencyCode: '' })],
    ['an empty identifier', storeProduct({ identifier: '' })],
  ])('drops a product with %s', (_label, product) => {
    expect(planOfferOf('monthly', rcPackage('monthly', product), undefined)).toBeUndefined();
  });

  it('hands over the store price string, and leaves it out when the store gives none', () => {
    const withString = planOfferOf('monthly', rcPackage('monthly', storeProduct({ priceString: 'CHF 8.90', currencyCode: 'CHF', price: 8.9 })), undefined);
    expect(withString?.price).toEqual({ amount: 8.9, currencyCode: 'CHF', formatted: 'CHF 8.90' });
    const withoutString = planOfferOf('monthly', rcPackage('monthly', storeProduct({ priceString: '' })), undefined);
    expect(withoutString?.price).toEqual({ amount: 9.99, currencyCode: 'EUR' });
  });

  it('drops a null, missing or malformed package', () => {
    expect(planOfferOf('monthly', null, undefined)).toBeUndefined();
    expect(planOfferOf('monthly', undefined, undefined)).toBeUndefined();
    expect(planOfferOf('monthly', { packageType: PACKAGE_TYPE.MONTHLY } as never, undefined)).toBeUndefined();
  });
});

describe('free trial — the introductory offer must be free, its length is the store’s', () => {
  it('reads a free introductory period in the store unit, multiplied by its cycles', () => {
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('WEEK', 2))).toEqual({ unit: 'week', count: 2 });
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('DAY', 3))).toEqual({ unit: 'day', count: 3 });
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('MONTH', 1))).toEqual({ unit: 'month', count: 1 });
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('YEAR', 1))).toEqual({ unit: 'year', count: 1 });
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('WEEK', 1, { cycles: 3 }))).toEqual({ unit: 'week', count: 3 });
  });

  it('is no trial at all when the introductory price is paid, absent or malformed', () => {
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('MONTH', 1, { price: 4.99, priceString: '4,99 €' }))).toBeUndefined();
    expect(freePeriodOfIntroductoryOffer(null)).toBeUndefined();
    expect(freePeriodOfIntroductoryOffer(undefined)).toBeUndefined();
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('WEEK', 0))).toBeUndefined();
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('WEEK', 1.5))).toBeUndefined();
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('WEEK', 1, { cycles: 0 }))).toBeUndefined();
    expect(freePeriodOfIntroductoryOffer(freeIntroductoryPrice('FORTNIGHT' as 'WEEK', 1))).toBeUndefined();
  });

  it('a paid introductory offer produces no trial and no eligibility claim on the plan', () => {
    const paidIntro = storeProduct({ introPrice: freeIntroductoryPrice('MONTH', 1, { price: 4.99, priceString: '4,99 €' }) });
    expect(freeTrialOf(paidIntro, appStoreEligibility(ELIGIBLE))).toBeUndefined();
    expect(planOfferOf('monthly', rcPackage('monthly', paidIntro), appStoreEligibility(ELIGIBLE))).toEqual({
      plan: 'monthly',
      price: { amount: 9.99, currencyCode: 'EUR', formatted: '9,99 €' },
    });
  });

  it('a product without introductory offer carries no trial, whatever the eligibility map says', () => {
    const plain = storeProduct({ introPrice: null });
    expect(freeTrialOf(plain, appStoreEligibility(ELIGIBLE))).toBeUndefined();
  });

  it('keeps a different trial length exactly as the store reports it', () => {
    const oneMonth = storeProduct({ introPrice: freeIntroductoryPrice('MONTH', 1) });
    expect(freeTrialOf(oneMonth, appStoreEligibility(ELIGIBLE))).toEqual({
      period: { unit: 'month', count: 1 },
      eligibility: 'eligible',
    });
  });

  it('lists the product identifiers worth an eligibility check: those with a free trial, once each', () => {
    expect(productIdentifiersWithFreeTrial(appStoreOfferings.current)).toEqual([ANNUAL_ID, MONTHLY_ID]);
    expect(productIdentifiersWithFreeTrial(testStoreOfferings.current)).toEqual([]);
    expect(productIdentifiersWithFreeTrial(null)).toEqual([]);
    const shared = storeProduct({ introPrice: freeIntroductoryPrice('WEEK', 1) });
    expect(
      productIdentifiersWithFreeTrial(offering({ monthly: rcPackage('monthly', shared), annual: rcPackage('annual', shared) })),
    ).toEqual([shared.identifier]);
  });
});

describe('trial eligibility — only a definite answer of the SDK counts', () => {
  it('maps ELIGIBLE and INELIGIBLE, and everything else to unknown', () => {
    expect(trialEligibilityOf(MONTHLY_ID, appStoreEligibility(ELIGIBLE))).toBe('eligible');
    expect(trialEligibilityOf(MONTHLY_ID, appStoreEligibility(INELIGIBLE))).toBe('ineligible');
    expect(trialEligibilityOf(MONTHLY_ID, appStoreEligibility(UNKNOWN_ELIGIBILITY))).toBe('unknown');
    // The store contradicts the product (it carries a free intro offer): nothing is advertised.
    expect(trialEligibilityOf(MONTHLY_ID, appStoreEligibility(NO_INTRO_OFFER))).toBe('unknown');
  });

  it('is unknown when the check failed, answered nothing for the product, or answered garbage', () => {
    expect(trialEligibilityOf(MONTHLY_ID, undefined)).toBe('unknown');
    expect(trialEligibilityOf(MONTHLY_ID, {})).toBe('unknown');
    expect(trialEligibilityOf(MONTHLY_ID, { [ANNUAL_ID]: ELIGIBLE })).toBe('unknown');
    expect(trialEligibilityOf(MONTHLY_ID, { [MONTHLY_ID]: 'eligible' as never })).toBe('unknown');
    expect(trialEligibilityOf(MONTHLY_ID, { [MONTHLY_ID]: { status: 99 as never, description: '?' } })).toBe('unknown');
  });

  it('answers plan by plan: the same offering can be eligible for one product and not the other', () => {
    const eligibility = { [MONTHLY_ID]: ELIGIBLE, [ANNUAL_ID]: INELIGIBLE };
    const result = mapOfferingsToPaywallOffering(appStoreOfferings, eligibility);
    expect(result.status === 'available' && result.plans.map((plan) => [plan.plan, plan.freeTrial?.eligibility])).toEqual([
      ['annual', 'ineligible'],
      ['monthly', 'eligible'],
    ]);
  });

  it('an unsupported platform (Android always UNKNOWN) advertises nothing', () => {
    const result = mapOfferingsToPaywallOffering(appStoreOfferings, appStoreEligibility(UNKNOWN_ELIGIBILITY));
    expect(result.status === 'available' && result.plans.every((plan) => plan.freeTrial?.eligibility === 'unknown')).toBe(true);
  });

  it('hands the trial of the monthly product through the monthly plan only', () => {
    const result = mapOfferingsToPaywallOffering(
      offerings(
        offering({
          annual: rcPackage('annual', storeProduct({ identifier: ANNUAL_ID, subscriptionPeriod: 'P1Y', price: 99, priceString: '99,00 €' })),
        }),
      ),
      { [MONTHLY_ID]: ELIGIBLE },
    );
    expect(result.status === 'available' && result.plans).toEqual([
      { plan: 'annual', price: { amount: 99, currencyCode: 'EUR', formatted: '99,00 €' } },
      {
        plan: 'monthly',
        price: { amount: 9.99, currencyCode: 'EUR', formatted: '9,99 €' },
        freeTrial: { period: { unit: 'week', count: 2 }, eligibility: 'eligible' },
      },
    ]);
    expect(appStoreMonthlyProduct.identifier).toBe(MONTHLY_ID);
  });
});

describe('selectPlanPackages — the store package behind each presented plan', () => {
  it('hands back the very package objects of the offering slots, for the mapped plans only', () => {
    const mapped = mapOfferingsToPaywallOffering(appStoreOfferings, undefined);
    const packages = selectPlanPackages(appStoreOfferings, mapped.status === 'available' ? mapped.plans : []);
    expect(packages.annual).toBe(appStoreOfferings.current!.annual);
    expect(packages.monthly).toBe(appStoreOfferings.current!.monthly);
  });

  it('selects nothing for a plan the mapping dropped, and nothing without a current offering', () => {
    const packages = selectPlanPackages(appStoreOfferings, [{ plan: 'annual', price: { amount: 99, currencyCode: 'EUR' } }]);
    expect(Object.keys(packages)).toEqual(['annual']);
    expect(selectPlanPackages(offerings(null), [{ plan: 'annual', price: { amount: 99, currencyCode: 'EUR' } }])).toEqual({});
    expect(selectPlanPackages({} as PurchasesOfferings, [])).toEqual({});
  });

  it('never selects a package by position, price or title: the slot must carry the plan type', () => {
    const swapped = offerings(
      offering({ monthly: rcPackage('monthly', appStoreMonthlyProduct, { packageType: PACKAGE_TYPE.ANNUAL }) }),
    );
    const packages = selectPlanPackages(swapped, [{ plan: 'monthly', price: { amount: 9.99, currencyCode: 'EUR' } }]);
    expect(packages.monthly).toBeUndefined();
  });
});
