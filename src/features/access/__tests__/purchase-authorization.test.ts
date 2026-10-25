// BeautIzzy — THE purchase authorization rule (Phase 6.4B): the Test Store
// stays purchasable; the App Store is purchasable ONLY for the explicitly
// requested Apple Sandbox test of a dedicated test account, on iOS, in a
// debug bundle, from a source carrying Apple Sandbox mode. Every other
// combination — a release, TestFlight, Android, a product purchase, an
// undeclared account, a source without the mode — is refused. A restore is
// restricted in Apple Sandbox mode only.

import {
  isDedicatedTestAccount,
  resolvePurchaseRefusal,
  resolveRestoreRefusal,
  type PurchaseAuthorizationInput,
} from '../purchase-authorization';
import { PURCHASABLE_STORES } from '../purchasable-stores';
import type { AppleSandboxMode } from '../subscription-source';

const TESTER = { id: 'user-tester', email: 'Tester@Example.com' };
const PILOT = { id: 'user-pilot', email: 'pilot@example.com' };
const MODE: AppleSandboxMode = { testAccounts: ['tester@example.com'] };
const MODE_BY_ID: AppleSandboxMode = { testAccounts: ['user-tester'] };
const EMPTY_MODE: AppleSandboxMode = { testAccounts: [] };

/** The one authorized Apple Sandbox purchase. */
const SANDBOX: PurchaseAuthorizationInput = {
  store: 'app-store',
  appleSandbox: MODE,
  origin: 'apple-sandbox-test',
  platform: 'ios',
  debug: true,
  account: TESTER,
};

describe('isDedicatedTestAccount', () => {
  it('matches by email, case-insensitively, and by id', () => {
    expect(isDedicatedTestAccount(TESTER, MODE)).toBe(true);
    expect(isDedicatedTestAccount({ id: 'other', email: 'TESTER@example.com' }, MODE)).toBe(true);
    expect(isDedicatedTestAccount(TESTER, MODE_BY_ID)).toBe(true);
    expect(isDedicatedTestAccount({ id: 'user-tester' }, MODE_BY_ID)).toBe(true);
  });

  it('matches nobody without a mode, with an empty list, without an account, or for an undeclared account', () => {
    expect(isDedicatedTestAccount(TESTER, undefined)).toBe(false);
    expect(isDedicatedTestAccount(TESTER, EMPTY_MODE)).toBe(false);
    expect(isDedicatedTestAccount(undefined, MODE)).toBe(false);
    expect(isDedicatedTestAccount(PILOT, MODE)).toBe(false);
    expect(isDedicatedTestAccount({ id: 'user-pilot' }, MODE)).toBe(false);
  });

  it('never matches an empty email against an empty entry', () => {
    expect(isDedicatedTestAccount({ id: 'x', email: '' }, { testAccounts: [''] })).toBe(false);
    expect(isDedicatedTestAccount({ id: 'x', email: '   ' }, { testAccounts: [''] })).toBe(false);
  });
});

describe('resolvePurchaseRefusal', () => {
  it('keeps the Test Store purchasable for a product purchase, whatever else is set', () => {
    expect(PURCHASABLE_STORES).toEqual(['test-store']);
    expect(resolvePurchaseRefusal({ ...SANDBOX, store: 'test-store', origin: 'product', appleSandbox: undefined, account: PILOT })).toBeUndefined();
    expect(resolvePurchaseRefusal({ ...SANDBOX, store: 'test-store', platform: 'android', debug: true, origin: 'product', account: undefined })).toBeUndefined();
  });

  it('authorizes the Apple Sandbox test when EVERY condition holds', () => {
    expect(resolvePurchaseRefusal(SANDBOX)).toBeUndefined();
    expect(resolvePurchaseRefusal({ ...SANDBOX, appleSandbox: MODE_BY_ID })).toBeUndefined();
  });

  it.each([
    ['a product purchase (no explicit opt-in)', { origin: 'product' }, 'not-enabled'],
    ['a release bundle', { debug: false }, 'not-enabled'],
    ['Android', { platform: 'android' }, 'not-enabled'],
    ['the web', { platform: 'web' }, 'not-enabled'],
    ['a source without Apple Sandbox mode (a release bound to the App Store)', { appleSandbox: undefined }, 'not-enabled'],
    ['no store at all', { store: undefined }, 'not-enabled'],
    ['an undeclared account', { account: PILOT }, 'not-test-account'],
    ['nobody signed in', { account: undefined }, 'not-test-account'],
    ['a mode declaring no account', { appleSandbox: EMPTY_MODE }, 'not-test-account'],
  ] as const)('refuses %s', (_label, overrides, refusal) => {
    expect(resolvePurchaseRefusal({ ...SANDBOX, ...overrides })).toBe(refusal);
  });

  it('refuses a release or TestFlight build even with the opt-in, the mode and a declared account: debug is checked on its own', () => {
    expect(resolvePurchaseRefusal({ ...SANDBOX, debug: false })).toBe('not-enabled');
    expect(resolvePurchaseRefusal({ ...SANDBOX, debug: false, platform: 'android' })).toBe('not-enabled');
  });

  it('checks the build before the account: a refused build never reveals whether the account is declared', () => {
    expect(resolvePurchaseRefusal({ ...SANDBOX, debug: false, account: PILOT })).toBe('not-enabled');
    expect(resolvePurchaseRefusal({ ...SANDBOX, origin: 'product', account: PILOT })).toBe('not-enabled');
  });
});

describe('resolveRestoreRefusal', () => {
  it('restricts nothing outside Apple Sandbox mode', () => {
    expect(resolveRestoreRefusal({ appleSandbox: undefined, account: PILOT })).toBeUndefined();
    expect(resolveRestoreRefusal({ appleSandbox: undefined, account: undefined })).toBeUndefined();
  });

  it('in Apple Sandbox mode, restores for a dedicated test account only', () => {
    expect(resolveRestoreRefusal({ appleSandbox: MODE, account: TESTER })).toBeUndefined();
    expect(resolveRestoreRefusal({ appleSandbox: MODE, account: PILOT })).toBe('not-test-account');
    expect(resolveRestoreRefusal({ appleSandbox: MODE, account: undefined })).toBe('not-test-account');
    expect(resolveRestoreRefusal({ appleSandbox: EMPTY_MODE, account: TESTER })).toBe('not-test-account');
  });
});
