// BeautIzzy — the SDK facade binds exactly the identified surface of
// react-native-purchases: configure with an App User ID, logIn, the reads,
// the listener, the offerings, the introductory-offer eligibility and — since
// Phase 6.3 — the purchase of an ORIGINAL package and the user-initiated
// restore. No purchase by product, discount or option, no sync, no logOut is
// bound.

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

  it('buys the very package object it is given, and restores through the SDK; nothing else of the kind', async () => {
    const pkg = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'p' }, presentedOfferingContext: { offeringIdentifier: 'default' } };
    const result = { productIdentifier: 'p', customerInfo: {}, transaction: {} };
    purchases.purchasePackage.mockResolvedValue(result);
    purchases.restorePurchases.mockResolvedValue({ requestDate: 'now' });

    await expect(expoRevenueCatSdk.purchasePackage(pkg as never)).resolves.toBe(result);
    expect(purchases.purchasePackage).toHaveBeenCalledTimes(1);
    expect(purchases.purchasePackage.mock.calls[0]![0]).toBe(pkg);
    expect(purchases.purchasePackage.mock.calls[0]).toHaveLength(1);

    await expect(expoRevenueCatSdk.restorePurchases()).resolves.toEqual({ requestDate: 'now' });
    expect(purchases.restorePurchases).toHaveBeenCalledWith();
    for (const forbidden of ['purchaseProduct', 'purchaseStoreProduct', 'purchaseSubscriptionOption', 'logOut', 'syncPurchases']) {
      expect(purchases[forbidden]).not.toHaveBeenCalled();
    }
  });

  it('passes the SDK rejection through unchanged, whatever its shape', async () => {
    const rejection = { code: '1', message: 'cancelled', userInfo: { readableErrorCode: 'PURCHASE_CANCELLED_ERROR' } };
    purchases.purchasePackage.mockRejectedValue(rejection);
    await expect(expoRevenueCatSdk.purchasePackage({} as never)).rejects.toBe(rejection);
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

  it('binds the package purchase and the restore, and no other transaction, sync or logOut', () => {
    expect(Object.keys(expoRevenueCatSdk).sort()).toEqual([
      'addCustomerInfoUpdateListener',
      'checkTrialOrIntroductoryPriceEligibility',
      'configure',
      'getAppUserID',
      'getCustomerInfo',
      'getOfferings',
      'invalidateCustomerInfoCache',
      'logIn',
      'purchasePackage',
      'removeCustomerInfoUpdateListener',
      'restorePurchases',
    ]);
  });
});
