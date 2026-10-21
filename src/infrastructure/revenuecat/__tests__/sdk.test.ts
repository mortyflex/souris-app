// BeautIzzy — the SDK facade binds exactly the identified READ surface of
// react-native-purchases: configure with an App User ID, logIn, the reads,
// the listener, the offerings and the introductory-offer eligibility. No
// purchase, restore, sync or logOut is bound.

import { expoRevenueCatSdk } from '../sdk';

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(),
    getAppUserID: jest.fn(),
    getCustomerInfo: jest.fn(),
    invalidateCustomerInfoCache: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getOfferings: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(),
    purchasePackage: jest.fn(),
    purchaseProduct: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    purchaseSubscriptionOption: jest.fn(),
    restorePurchases: jest.fn(),
    logOut: jest.fn(),
    syncPurchases: jest.fn(),
  },
  PACKAGE_TYPE: { MONTHLY: 'MONTHLY', ANNUAL: 'ANNUAL' },
  INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0 },
}));

const purchases = jest.requireMock<{ default: Record<string, jest.Mock> }>('react-native-purchases').default;

describe('expoRevenueCatSdk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('configures the SDK with the key and the identified user only', () => {
    expoRevenueCatSdk.configure({ apiKey: 'test_FakeTestStoreKeyForUnitTestsOnly', appUserID: 'user-lea' });
    expect(purchases.configure).toHaveBeenCalledWith({ apiKey: 'test_FakeTestStoreKeyForUnitTestsOnly', appUserID: 'user-lea' });
  });

  it('delegates identity, reads and the listener to the SDK', async () => {
    purchases.logIn.mockResolvedValue({ customerInfo: {}, created: false });
    purchases.getAppUserID.mockResolvedValue('user-lea');
    purchases.getCustomerInfo.mockResolvedValue({});
    purchases.invalidateCustomerInfoCache.mockResolvedValue(undefined);
    purchases.removeCustomerInfoUpdateListener.mockReturnValue(true);
    const listener = () => undefined;

    await expect(expoRevenueCatSdk.logIn('user-lea')).resolves.toEqual({ customerInfo: {}, created: false });
    await expect(expoRevenueCatSdk.getAppUserID()).resolves.toBe('user-lea');
    await expect(expoRevenueCatSdk.getCustomerInfo()).resolves.toEqual({});
    await expect(expoRevenueCatSdk.invalidateCustomerInfoCache()).resolves.toBeUndefined();
    expoRevenueCatSdk.addCustomerInfoUpdateListener(listener);
    expect(expoRevenueCatSdk.removeCustomerInfoUpdateListener(listener)).toBe(true);

    expect(purchases.logIn).toHaveBeenCalledWith('user-lea');
    expect(purchases.addCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    expect(purchases.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    for (const forbidden of ['purchasePackage', 'purchaseProduct', 'restorePurchases', 'logOut', 'syncPurchases']) {
      expect(purchases[forbidden]).not.toHaveBeenCalled();
    }
  });

  it('reads the offerings and the eligibility of a copied identifier list; nothing is bought or restored', async () => {
    const offerings = { all: {}, current: null };
    const eligibility = { 'product.a': { status: 0, description: 'unknown' } };
    purchases.getOfferings.mockResolvedValue(offerings);
    purchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue(eligibility);
    const identifiers: readonly string[] = Object.freeze(['product.a', 'product.b']);

    await expect(expoRevenueCatSdk.getOfferings()).resolves.toBe(offerings);
    await expect(expoRevenueCatSdk.checkTrialOrIntroductoryPriceEligibility(identifiers)).resolves.toBe(eligibility);

    expect(purchases.getOfferings).toHaveBeenCalledTimes(1);
    expect(purchases.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledWith(['product.a', 'product.b']);
    // The SDK receives its own mutable array, never the caller's frozen one.
    expect(purchases.checkTrialOrIntroductoryPriceEligibility.mock.calls[0]![0]).not.toBe(identifiers);
    for (const forbidden of [
      'purchasePackage',
      'purchaseProduct',
      'purchaseStoreProduct',
      'purchaseSubscriptionOption',
      'restorePurchases',
      'logOut',
      'syncPurchases',
    ]) {
      expect(purchases[forbidden]).not.toHaveBeenCalled();
    }
  });

  it('binds no purchase, restore, sync or logOut entry point at all', () => {
    expect(Object.keys(expoRevenueCatSdk).sort()).toEqual([
      'addCustomerInfoUpdateListener',
      'checkTrialOrIntroductoryPriceEligibility',
      'configure',
      'getAppUserID',
      'getCustomerInfo',
      'getOfferings',
      'invalidateCustomerInfoCache',
      'logIn',
      'removeCustomerInfoUpdateListener',
    ]);
  });
});
