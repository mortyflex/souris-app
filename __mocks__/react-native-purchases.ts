// BeautIzzy — Jest manual mock of react-native-purchases
//
// The real module pulls in RevenueCat's browser-mode implementation
// (`@revenuecat/purchases-js-hybrid-mappings`), an ESM bundle Jest does not
// transform, and reads the native module at import time. No test may touch a
// store: this mock exposes the identified surface the application binds
// (src/infrastructure/revenuecat/sdk.ts) as inert functions — every call
// behaves like an SDK that was never configured. Suites that verify the
// binding itself replace it with `jest.mock` and a factory. Jest picks up a
// root `__mocks__/<package>` automatically; application code never imports
// this file.

const notConfigured = () => Promise.reject(new Error('react-native-purchases mock: not configured'));

// The SDK's enumerations the mapping compares (values copied from the installed
// @revenuecat/purchases-typescript-internal declarations).
export const PACKAGE_TYPE = {
  UNKNOWN: 'UNKNOWN',
  CUSTOM: 'CUSTOM',
  LIFETIME: 'LIFETIME',
  ANNUAL: 'ANNUAL',
  SIX_MONTH: 'SIX_MONTH',
  THREE_MONTH: 'THREE_MONTH',
  TWO_MONTH: 'TWO_MONTH',
  MONTHLY: 'MONTHLY',
  WEEKLY: 'WEEKLY',
} as const;

export const PRODUCT_CATEGORY = {
  NON_SUBSCRIPTION: 'NON_SUBSCRIPTION',
  SUBSCRIPTION: 'SUBSCRIPTION',
  UNKNOWN: 'UNKNOWN',
} as const;

export const PRODUCT_TYPE = {
  CONSUMABLE: 'CONSUMABLE',
  NON_CONSUMABLE: 'NON_CONSUMABLE',
  NON_RENEWABLE_SUBSCRIPTION: 'NON_RENEWABLE_SUBSCRIPTION',
  AUTO_RENEWABLE_SUBSCRIPTION: 'AUTO_RENEWABLE_SUBSCRIPTION',
  PREPAID_SUBSCRIPTION: 'PREPAID_SUBSCRIPTION',
  UNKNOWN: 'UNKNOWN',
} as const;

export const INTRO_ELIGIBILITY_STATUS = {
  INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
  INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
  INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
  INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS: 3,
} as const;

const Purchases = {
  configure: jest.fn(),
  isConfigured: jest.fn(() => Promise.resolve(false)),
  logIn: jest.fn(notConfigured),
  getAppUserID: jest.fn(notConfigured),
  getCustomerInfo: jest.fn(notConfigured),
  invalidateCustomerInfoCache: jest.fn(notConfigured),
  addCustomerInfoUpdateListener: jest.fn(),
  removeCustomerInfoUpdateListener: jest.fn(() => false),
  getOfferings: jest.fn(notConfigured),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(notConfigured),
};

export default Purchases;
