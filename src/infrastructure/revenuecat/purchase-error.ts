// BeautIzzy — what a rejected RevenueCat transaction means — pure
//
// THE translation of a rejection of `purchasePackage` / `restorePurchases`
// into the application's outcome vocabulary. The SDK rejects with its
// `PurchasesError` shape: a plain object (NOT necessarily an `Error`
// instance) carrying `code` — a PURCHASES_ERROR_CODE member, a NUMERIC string
// ("1", "20"…) once the SDK normalized the native rejection — a `message`, a
// `userInfo.readableErrorCode`, and a deprecated `userCancelled` flag. A code
// may also sit under `userInfo` when a bridge left it nested. Anything else
// (an `Error` thrown by the SDK before reaching the store, such as its
// "not configured" error, or something unknown) is `unexpected` or, when the
// SDK says it is not configured, `sdk-unavailable`.
//
// Cancellation is not a failure, and a deferred payment is not a success:
// both are outcomes of their own. Nothing here logs: no message, receipt or
// identifier ever leaves this function.

import type { StoreTransactionFailure } from '@/features/access/subscription-source';

import { PURCHASES_ERROR_CODE } from './sdk';

export type PurchasesErrorClassification =
  | { readonly kind: 'cancelled' }
  /** The store deferred the payment (an approval to come): nothing is owned yet. */
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly reason: StoreTransactionFailure };

const FAILED = (reason: StoreTransactionFailure): PurchasesErrorClassification => ({ kind: 'failed', reason });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The SDK's numeric code, wherever the bridge left it; undefined when the rejection carries none. */
export function readPurchasesErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const nested = isRecord(error.userInfo) ? error.userInfo.code : undefined;
  const candidate = error.code ?? nested;
  if (candidate === undefined || candidate === null) return undefined;
  const code = String(candidate);
  return /^\d+$/.test(code) ? code : undefined;
}

/** Whether the rejection is the SDK's own "configure was not called" error. */
function isUninitializedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'UninitializedPurchasesError' || /not configured|configure/i.test(error.message);
}

export function classifyPurchasesError(error: unknown): PurchasesErrorClassification {
  const code = readPurchasesErrorCode(error);
  if (code === undefined) {
    if (isRecord(error) && error.userCancelled === true) return { kind: 'cancelled' };
    return FAILED(isUninitializedError(error) ? 'sdk-unavailable' : 'unexpected');
  }
  switch (code) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return { kind: 'cancelled' };
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return { kind: 'pending' };
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
    case PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_RECEIPT_ERROR:
    case PURCHASES_ERROR_CODE.MISSING_RECEIPT_FILE_ERROR:
    case PURCHASES_ERROR_CODE.TEST_STORE_SIMULATED_PURCHASE_ERROR:
      return FAILED('store-problem');
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
    case PURCHASES_ERROR_CODE.INELIGIBLE_ERROR:
      return FAILED('product-unavailable');
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return FAILED('already-owned');
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
      return FAILED('linked-to-another-account');
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
    case PURCHASES_ERROR_CODE.INSUFFICIENT_PERMISSIONS_ERROR:
      return FAILED('not-allowed');
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
    case PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR:
    case PURCHASES_ERROR_CODE.API_ENDPOINT_BLOCKED:
      return FAILED('network');
    case PURCHASES_ERROR_CODE.OPERATION_ALREADY_IN_PROGRESS_ERROR:
      return FAILED('operation-in-progress');
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_APP_USER_ID_ERROR:
      return FAILED('sdk-unavailable');
    default:
      return FAILED('unexpected');
  }
}
