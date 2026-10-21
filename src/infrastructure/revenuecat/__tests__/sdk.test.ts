// BeautIzzy — the SDK facade binds exactly the identified surface of
// react-native-purchases: configure with an App User ID, logIn, the reads,
// the listener. No purchase, restore, sync or logOut is bound.

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
    purchasePackage: jest.fn(),
    purchaseProduct: jest.fn(),
    restorePurchases: jest.fn(),
    logOut: jest.fn(),
    syncPurchases: jest.fn(),
  },
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
});
