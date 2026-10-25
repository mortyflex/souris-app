// BeautIzzy — may THIS purchase or restore start? — pure (BeautIzzy Plus)
//
// THE authorization rule the provider applies before any store transaction,
// completing `purchasable-stores.ts` (which stores product purchases are
// enabled for: the Test Store only today) with the ONE exception of Phase
// 6.4B: the developer-only Apple Sandbox test. A purchase against the App
// Store is authorized when — and only when — EVERY independent condition
// holds; each is checked here again, whatever the caller already verified:
//
//   origin         the caller explicitly asked for the Apple Sandbox TEST
//                  (`apple-sandbox-test`): a product purchase (`product`, the
//                  default) is never promoted to one, so a future product
//                  screen calling `purchase` in a sandbox build is refused
//                  like any release;
//   platform       iOS: there is no Apple Sandbox elsewhere;
//   debug          a development bundle (`__DEV__`): a release or TestFlight
//                  build never passes, whatever its variant or flags;
//   appleSandbox   the source itself carries Apple Sandbox mode, which the
//                  configuration boundary grants to an iOS debug bundle built
//                  with `APP_VARIANT=apple-sandbox` and the App Store bundle
//                  identifier only (the RevenueCat configuration boundary);
//   store          that source is bound to the App Store;
//   account        the signed-in account is one of the DEDICATED TEST ACCOUNTS
//                  declared for the mode — never a professional's or a pilot's
//                  account, never an account nobody declared.
//
// A restore costs nothing and stays possible against any store, except in
// Apple Sandbox mode, where it is reserved to the same dedicated accounts: a
// Sandbox receipt must never be attached to a real account's RevenueCat
// customer. Nothing here starts, logs or names anything.

import type { AppleSandboxMode, StoreTransactionFailure, SubscriptionStoreKind } from './subscription-source';
import { isPurchasableStore } from './purchasable-stores';

/** Who asks for the purchase: product UI (none yet), or the developer-only Apple Sandbox test bench. */
export type PurchaseOrigin = 'product' | 'apple-sandbox-test';

/** An account as the authorization sees it: its id, its email when known. */
export interface TransactingAccount {
  readonly id: string;
  readonly email?: string;
}

export interface PurchaseAuthorizationInput {
  readonly store: SubscriptionStoreKind | undefined;
  readonly appleSandbox: AppleSandboxMode | undefined;
  readonly origin: PurchaseOrigin;
  /** `Platform.OS` of the running application. */
  readonly platform: string;
  /** `__DEV__`: a development bundle. */
  readonly debug: boolean;
  readonly account: TransactingAccount | undefined;
}

export type PurchaseRefusal = Extract<StoreTransactionFailure, 'not-enabled' | 'not-test-account'>;

/** Whether `account` is one of the dedicated test accounts of the mode: by id, or by email (case-insensitive). */
export function isDedicatedTestAccount(account: TransactingAccount | undefined, mode: AppleSandboxMode | undefined): boolean {
  if (account === undefined || mode === undefined || mode.testAccounts.length === 0) return false;
  const email = account.email?.trim().toLowerCase();
  return mode.testAccounts.some((entry) => entry === account.id || (email !== undefined && email.length > 0 && entry === email));
}

/** The reason a purchase is refused, or undefined when it may start. */
export function resolvePurchaseRefusal(input: PurchaseAuthorizationInput): PurchaseRefusal | undefined {
  if (isPurchasableStore(input.store)) return undefined;
  if (input.origin !== 'apple-sandbox-test') return 'not-enabled';
  if (input.platform !== 'ios' || !input.debug) return 'not-enabled';
  if (input.appleSandbox === undefined || input.store !== 'app-store') return 'not-enabled';
  if (!isDedicatedTestAccount(input.account, input.appleSandbox)) return 'not-test-account';
  return undefined;
}

export interface RestoreAuthorizationInput {
  readonly appleSandbox: AppleSandboxMode | undefined;
  readonly account: TransactingAccount | undefined;
}

/** The reason a restore is refused, or undefined when it may start: only Apple Sandbox mode restricts it. */
export function resolveRestoreRefusal(input: RestoreAuthorizationInput): Extract<StoreTransactionFailure, 'not-test-account'> | undefined {
  if (input.appleSandbox === undefined) return undefined;
  return isDedicatedTestAccount(input.account, input.appleSandbox) ? undefined : 'not-test-account';
}
