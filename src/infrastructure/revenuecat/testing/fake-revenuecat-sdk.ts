// BeautIzzy — deterministic RevenueCatSdk for tests (never imported by app code)
//
// Behaves like the process-global SDK: one identity at a time, a CustomerInfo
// per App User ID (what the SDK would hold in its cache or obtain from the
// store), an update event. A user without a scripted CustomerInfo reads as a
// store that cannot answer (rejection). Every call is recorded.

import type { CustomerInfo, CustomerInfoUpdateListener, LogInResult, RevenueCatSdk } from '../sdk';

export interface FakeRevenueCatSdk extends RevenueCatSdk {
  /** The identity the SDK holds, as the native SDK would; undefined before `configure`. */
  readonly appUserId: () => string | undefined;
  readonly listenerCount: () => number;
  /** Scripts what the SDK holds for `appUserId`: the cache it serves and the answer it fetches. */
  setCustomerInfo(appUserId: string, info: CustomerInfo | undefined): void;
  /** Fires the SDK's CustomerInfo update event, as a renewal, a purchase or a background fetch would. */
  emit(info: CustomerInfo): void;
  readonly calls: {
    configure: { readonly apiKey: string; readonly appUserID: string }[];
    logIn: string[];
    getAppUserID: number;
    getCustomerInfo: number;
    invalidateCustomerInfoCache: number;
  };
}

export interface FakeRevenueCatSdkOptions {
  /** Overrides `configure`; throwing simulates a build without the native module. */
  readonly configure?: (appUserID: string) => void;
  /** Overrides `logIn`; the fake switches its identity only when the promise resolves. */
  readonly logIn?: (appUserID: string) => Promise<LogInResult>;
  /** Overrides `getCustomerInfo` for the identified user. */
  readonly getCustomerInfo?: (appUserID: string) => Promise<CustomerInfo>;
}

export function createFakeRevenueCatSdk(options: FakeRevenueCatSdkOptions = {}): FakeRevenueCatSdk {
  const infos = new Map<string, CustomerInfo>();
  const listeners = new Set<CustomerInfoUpdateListener>();
  let appUserId: string | undefined;
  const calls: FakeRevenueCatSdk['calls'] = {
    configure: [],
    logIn: [],
    getAppUserID: 0,
    getCustomerInfo: 0,
    invalidateCustomerInfoCache: 0,
  };

  const answerFor = (id: string | undefined): Promise<CustomerInfo> => {
    const info = id === undefined ? undefined : infos.get(id);
    return info ? Promise.resolve(info) : Promise.reject(new Error('RevenueCat: no CustomerInfo available'));
  };

  return {
    calls,
    appUserId: () => appUserId,
    listenerCount: () => listeners.size,
    setCustomerInfo: (id, info) => {
      if (info) infos.set(id, info);
      else infos.delete(id);
    },
    emit: (info) => {
      for (const listener of listeners) listener(info);
    },
    configure: ({ apiKey, appUserID }) => {
      calls.configure.push({ apiKey, appUserID });
      options.configure?.(appUserID);
      appUserId = appUserID;
    },
    logIn: async (appUserID) => {
      calls.logIn.push(appUserID);
      if (options.logIn) {
        const result = await options.logIn(appUserID);
        appUserId = appUserID;
        return result;
      }
      const info = await answerFor(appUserID);
      appUserId = appUserID;
      return { customerInfo: info, created: false };
    },
    getAppUserID: () => {
      calls.getAppUserID += 1;
      return appUserId === undefined
        ? Promise.reject(new Error('RevenueCat: not configured'))
        : Promise.resolve(appUserId);
    },
    getCustomerInfo: () => {
      calls.getCustomerInfo += 1;
      if (options.getCustomerInfo && appUserId !== undefined) return options.getCustomerInfo(appUserId);
      return answerFor(appUserId);
    },
    invalidateCustomerInfoCache: () => {
      calls.invalidateCustomerInfoCache += 1;
      return Promise.resolve();
    },
    addCustomerInfoUpdateListener: (listener) => {
      listeners.add(listener);
    },
    removeCustomerInfoUpdateListener: (listener) => listeners.delete(listener),
  };
}
