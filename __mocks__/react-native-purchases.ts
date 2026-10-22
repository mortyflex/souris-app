// BeautIzzy — Jest manual mock of react-native-purchases
//
// The real module pulls in RevenueCat's browser-mode implementation
// (`@revenuecat/purchases-js-hybrid-mappings`), an ESM bundle Jest does not
// transform, and reads the native module at import time. No test may touch a
// store: this mock exposes the identified surface the application binds
// (src/infrastructure/revenuecat/sdk.ts), the two transactions included, as
// inert functions — every call behaves like an SDK that was never configured. Suites that verify the
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

// The SDK's error codes (values copied from the installed generated/error-codes
// declarations): a `PurchasesError.code` is one of these NUMERIC strings.
export const PURCHASES_ERROR_CODE = {
  UNKNOWN_ERROR: '0',
  PURCHASE_CANCELLED_ERROR: '1',
  STORE_PROBLEM_ERROR: '2',
  PURCHASE_NOT_ALLOWED_ERROR: '3',
  PURCHASE_INVALID_ERROR: '4',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5',
  PRODUCT_ALREADY_PURCHASED_ERROR: '6',
  RECEIPT_ALREADY_IN_USE_ERROR: '7',
  INVALID_RECEIPT_ERROR: '8',
  MISSING_RECEIPT_FILE_ERROR: '9',
  NETWORK_ERROR: '10',
  INVALID_CREDENTIALS_ERROR: '11',
  UNEXPECTED_BACKEND_RESPONSE_ERROR: '12',
  RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR: '13',
  INVALID_APP_USER_ID_ERROR: '14',
  OPERATION_ALREADY_IN_PROGRESS_ERROR: '15',
  UNKNOWN_BACKEND_ERROR: '16',
  INVALID_APPLE_SUBSCRIPTION_KEY_ERROR: '17',
  INELIGIBLE_ERROR: '18',
  INSUFFICIENT_PERMISSIONS_ERROR: '19',
  PAYMENT_PENDING_ERROR: '20',
  INVALID_SUBSCRIBER_ATTRIBUTES_ERROR: '21',
  LOG_OUT_ANONYMOUS_USER_ERROR: '22',
  CONFIGURATION_ERROR: '23',
  UNSUPPORTED_ERROR: '24',
  EMPTY_SUBSCRIBER_ATTRIBUTES_ERROR: '25',
  PRODUCT_DISCOUNT_MISSING_IDENTIFIER_ERROR: '26',
  PRODUCT_DISCOUNT_MISSING_SUBSCRIPTION_GROUP_IDENTIFIER_ERROR: '28',
  CUSTOMER_INFO_ERROR: '29',
  SYSTEM_INFO_ERROR: '30',
  BEGIN_REFUND_REQUEST_ERROR: '31',
  PRODUCT_REQUEST_TIMED_OUT_ERROR: '32',
  API_ENDPOINT_BLOCKED: '33',
  INVALID_PROMOTIONAL_OFFER_ERROR: '34',
  OFFLINE_CONNECTION_ERROR: '35',
  TEST_STORE_SIMULATED_PURCHASE_ERROR: '42',
} as const;

export class UninitializedPurchasesError extends Error {
  constructor() {
    super('There is no singleton instance. Make sure you configure Purchases before trying to get the default instance.');
    this.name = 'UninitializedPurchasesError';
  }
}

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
  purchasePackage: jest.fn(notConfigured),
  restorePurchases: jest.fn(notConfigured),
};

export default Purchases;
