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

const Purchases = {
  configure: jest.fn(),
  isConfigured: jest.fn(() => Promise.resolve(false)),
  logIn: jest.fn(notConfigured),
  getAppUserID: jest.fn(notConfigured),
  getCustomerInfo: jest.fn(notConfigured),
  invalidateCustomerInfoCache: jest.fn(notConfigured),
  addCustomerInfoUpdateListener: jest.fn(),
  removeCustomerInfoUpdateListener: jest.fn(() => false),
};

export default Purchases;
