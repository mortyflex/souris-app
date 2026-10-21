// BeautIzzy — RevenueCat offerings fixtures for tests (never imported by app code)
//
// Complete objects with the SDK's documented field names, so the mapping is
// exercised against real shapes: the App Store products behind `$rc_monthly`
// and `$rc_annual`, and Test Store equivalents. The amounts here are TEST
// values, deliberately unlike the intended French prices: no fixture price
// ever reaches product code, and the mapping is verified to hand over
// whatever the store says.

import type {
  IntroEligibility,
  PurchasesIntroPrice,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';
import { INTRO_ELIGIBILITY_STATUS, PACKAGE_TYPE, PRODUCT_CATEGORY, PRODUCT_TYPE } from 'react-native-purchases';

import { APP_STORE_PLUS_PRODUCT_IDENTIFIERS } from '../customer-info';
import { PLUS_PACKAGE_IDENTIFIERS } from '../offering';
import type { IntroEligibilityByProduct } from '../sdk';

export const TEST_STORE_PRODUCT_IDENTIFIERS = {
  monthly: 'test_plus_monthly',
  annual: 'test_plus_annual',
} as const;

export const DEFAULT_OFFERING_IDENTIFIER = 'default';

/** A free introductory period of `units` × `unit`, as Apple reports a trial. */
export function freeIntroductoryPrice(
  periodUnit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR',
  periodNumberOfUnits: number,
  overrides: Partial<PurchasesIntroPrice> = {},
): PurchasesIntroPrice {
  const iso = { DAY: 'D', WEEK: 'W', MONTH: 'M', YEAR: 'Y' }[periodUnit];
  return {
    price: 0,
    priceString: '0,00 €',
    cycles: 1,
    period: `P${periodNumberOfUnits}${iso}`,
    periodUnit,
    periodNumberOfUnits,
    ...overrides,
  };
}

export interface StoreProductFixture {
  readonly identifier?: string;
  readonly price?: number;
  readonly priceString?: string;
  readonly currencyCode?: string;
  readonly subscriptionPeriod?: string | null;
  readonly introPrice?: PurchasesIntroPrice | null;
  readonly title?: string;
}

export function storeProduct({
  identifier = APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly,
  price = 9.99,
  priceString = '9,99 €',
  currencyCode = 'EUR',
  subscriptionPeriod = 'P1M',
  introPrice = null,
  title = 'BeautIzzy Plus',
}: StoreProductFixture = {}): PurchasesStoreProduct {
  return {
    identifier,
    description: 'BeautIzzy Plus subscription',
    title,
    price,
    priceString,
    pricePerWeek: null,
    pricePerMonth: null,
    pricePerYear: null,
    pricePerWeekString: null,
    pricePerMonthString: null,
    pricePerYearString: null,
    currencyCode,
    introPrice,
    discounts: [],
    productCategory: PRODUCT_CATEGORY.SUBSCRIPTION,
    productType: PRODUCT_TYPE.AUTO_RENEWABLE_SUBSCRIPTION,
    subscriptionPeriod,
    defaultOption: null,
    subscriptionOptions: null,
    presentedOfferingIdentifier: DEFAULT_OFFERING_IDENTIFIER,
    presentedOfferingContext: {
      offeringIdentifier: DEFAULT_OFFERING_IDENTIFIER,
      placementIdentifier: null,
      targetingContext: null,
    },
    installmentsInfo: null,
  };
}

export function rcPackage(
  plan: 'monthly' | 'annual',
  product: PurchasesStoreProduct,
  overrides: Partial<PurchasesPackage> = {},
): PurchasesPackage {
  return {
    identifier: PLUS_PACKAGE_IDENTIFIERS[plan],
    packageType: plan === 'monthly' ? PACKAGE_TYPE.MONTHLY : PACKAGE_TYPE.ANNUAL,
    product,
    offeringIdentifier: DEFAULT_OFFERING_IDENTIFIER,
    presentedOfferingContext: {
      offeringIdentifier: DEFAULT_OFFERING_IDENTIFIER,
      placementIdentifier: null,
      targetingContext: null,
    },
    webCheckoutUrl: null,
    ...overrides,
  };
}

/** The App Store monthly product: a test amount with a free two-week introductory period. */
export const appStoreMonthlyProduct = storeProduct({
  identifier: APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly,
  price: 9.99,
  priceString: '9,99 €',
  subscriptionPeriod: 'P1M',
  introPrice: freeIntroductoryPrice('WEEK', 2),
});

/** The App Store annual product: a test amount with the same free two-week introductory period. */
export const appStoreAnnualProduct = storeProduct({
  identifier: APP_STORE_PLUS_PRODUCT_IDENTIFIERS.annual,
  price: 99,
  priceString: '99,00 €',
  subscriptionPeriod: 'P1Y',
  introPrice: freeIntroductoryPrice('WEEK', 2),
});

/** Test Store equivalents: other identifiers, other amounts, no introductory offer. */
export const testStoreMonthlyProduct = storeProduct({
  identifier: TEST_STORE_PRODUCT_IDENTIFIERS.monthly,
  price: 4.99,
  priceString: '$4.99',
  currencyCode: 'USD',
  subscriptionPeriod: 'P1M',
});

export const testStoreAnnualProduct = storeProduct({
  identifier: TEST_STORE_PRODUCT_IDENTIFIERS.annual,
  price: 49.99,
  priceString: '$49.99',
  currencyCode: 'USD',
  subscriptionPeriod: 'P1Y',
});

export interface OfferingFixture {
  readonly identifier?: string;
  readonly monthly?: PurchasesPackage | null;
  readonly annual?: PurchasesPackage | null;
  /** Extra packages listed in `availablePackages` only (a custom package the app ignores). */
  readonly otherPackages?: readonly PurchasesPackage[];
}

export function offering({
  identifier = DEFAULT_OFFERING_IDENTIFIER,
  monthly = rcPackage('monthly', appStoreMonthlyProduct),
  annual = rcPackage('annual', appStoreAnnualProduct),
  otherPackages = [],
}: OfferingFixture = {}): PurchasesOffering {
  const availablePackages = [annual, monthly, ...otherPackages].filter(
    (pkg): pkg is PurchasesPackage => pkg !== null,
  );
  return {
    identifier,
    serverDescription: 'The default offering',
    metadata: {},
    availablePackages,
    lifetime: null,
    annual,
    sixMonth: null,
    threeMonth: null,
    twoMonth: null,
    monthly,
    weekly: null,
    webCheckoutUrl: null,
  };
}

/** `offerings` with `current` set to `offering`; `null` for a dashboard without a current offering. */
export function offerings(current: PurchasesOffering | null = offering()): PurchasesOfferings {
  return {
    all: current ? { [current.identifier]: current } : {},
    current,
  };
}

export const appStoreOfferings = offerings(offering());

export const testStoreOfferings = offerings(
  offering({
    monthly: rcPackage('monthly', testStoreMonthlyProduct),
    annual: rcPackage('annual', testStoreAnnualProduct),
  }),
);

function eligibility(status: INTRO_ELIGIBILITY_STATUS, description: string): IntroEligibility {
  return { status, description };
}

export const ELIGIBLE = eligibility(INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE, 'eligible');
export const INELIGIBLE = eligibility(INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE, 'ineligible');
export const UNKNOWN_ELIGIBILITY = eligibility(INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_UNKNOWN, 'unknown');
export const NO_INTRO_OFFER = eligibility(
  INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS,
  'no introductory offer',
);

/** The same eligibility answer for both App Store products. */
export function appStoreEligibility(answer: IntroEligibility): IntroEligibilityByProduct {
  return {
    [APP_STORE_PLUS_PRODUCT_IDENTIFIERS.monthly]: answer,
    [APP_STORE_PLUS_PRODUCT_IDENTIFIERS.annual]: answer,
  };
}
