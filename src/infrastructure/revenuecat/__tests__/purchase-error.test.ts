// BeautIzzy — a rejected RevenueCat transaction, classified: the SDK's own
// numeric codes (wherever the bridge left them), cancellation apart from
// failure, a deferred payment apart from success, nothing assumed to be an
// Error instance, nothing logged.

import { PURCHASES_ERROR_CODE } from '../sdk';
import { classifyPurchasesError, readPurchasesErrorCode } from '../purchase-error';
import { purchasesError } from '../testing/fake-revenuecat-sdk';

describe('readPurchasesErrorCode', () => {
  it('reads the numeric code string at the top level or nested under userInfo, and nothing else', () => {
    expect(readPurchasesErrorCode(purchasesError('2'))).toBe('2');
    expect(readPurchasesErrorCode({ userInfo: { code: 10 } })).toBe('10');
    expect(readPurchasesErrorCode({ code: 'UNIMPLEMENTED' })).toBeUndefined();
    expect(readPurchasesErrorCode(new Error('boom'))).toBeUndefined();
    expect(readPurchasesErrorCode('2')).toBeUndefined();
    expect(readPurchasesErrorCode(null)).toBeUndefined();
    expect(readPurchasesErrorCode(undefined)).toBeUndefined();
  });
});

describe('classifyPurchasesError', () => {
  it('a cancellation is not a failure, with or without the deprecated flag', () => {
    expect(classifyPurchasesError(purchasesError(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR))).toEqual({ kind: 'cancelled' });
    expect(classifyPurchasesError({ userCancelled: true })).toEqual({ kind: 'cancelled' });
  });

  it('a deferred payment is pending: never a success, never a failure', () => {
    expect(classifyPurchasesError(purchasesError(PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR))).toEqual({ kind: 'pending' });
  });

  it.each([
    [PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR, 'store-problem'],
    [PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR, 'store-problem'],
    [PURCHASES_ERROR_CODE.TEST_STORE_SIMULATED_PURCHASE_ERROR, 'store-problem'],
    [PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR, 'product-unavailable'],
    [PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR, 'already-owned'],
    [PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR, 'linked-to-another-account'],
    [PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR, 'linked-to-another-account'],
    [PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR, 'not-allowed'],
    [PURCHASES_ERROR_CODE.NETWORK_ERROR, 'network'],
    [PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR, 'network'],
    [PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR, 'network'],
    [PURCHASES_ERROR_CODE.OPERATION_ALREADY_IN_PROGRESS_ERROR, 'operation-in-progress'],
    [PURCHASES_ERROR_CODE.CONFIGURATION_ERROR, 'sdk-unavailable'],
    [PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR, 'sdk-unavailable'],
    [PURCHASES_ERROR_CODE.UNKNOWN_ERROR, 'unexpected'],
    [PURCHASES_ERROR_CODE.UNEXPECTED_BACKEND_RESPONSE_ERROR, 'unexpected'],
    ['41', 'unexpected'], // a native-only code the enum omits
  ])('code %s is a failure for the reason %s', (code, reason) => {
    expect(classifyPurchasesError(purchasesError(code))).toEqual({ kind: 'failed', reason });
  });

  it('a code nested by the bridge is read the same way', () => {
    expect(classifyPurchasesError({ userInfo: { code: '5' } })).toEqual({ kind: 'failed', reason: 'product-unavailable' });
  });

  it('the SDK refusing to act before configure is sdk-unavailable; anything else unexpected', () => {
    const uninitialized = new Error('There is no singleton instance. Make sure you configure Purchases before trying to get the default instance.');
    uninitialized.name = 'UninitializedPurchasesError';
    expect(classifyPurchasesError(uninitialized)).toEqual({ kind: 'failed', reason: 'sdk-unavailable' });
    expect(classifyPurchasesError(new Error('react-native-purchases: not configured'))).toEqual({ kind: 'failed', reason: 'sdk-unavailable' });
    expect(classifyPurchasesError(new Error('boom'))).toEqual({ kind: 'failed', reason: 'unexpected' });
    expect(classifyPurchasesError('boom')).toEqual({ kind: 'failed', reason: 'unexpected' });
    expect(classifyPurchasesError(undefined)).toEqual({ kind: 'failed', reason: 'unexpected' });
    expect(classifyPurchasesError({ code: 'PAYWALL_ERROR' })).toEqual({ kind: 'failed', reason: 'unexpected' });
  });
});
