// BeautIzzy — the guard of the development bench: every condition, each
// refusal with its own sentence, nothing about an account. Two testable
// stores: RevenueCat's Test Store (Phase 6.3), and the App Store in Apple
// Sandbox mode for a dedicated test account (Phase 6.4B).

import type { PaywallOffering } from '../../paywall-offering';
import { paywallOfferingFixtures } from '../../testing/paywall-fixtures';
import {
  TEST_PURCHASE_REFUSALS,
  TEST_RESTORE_REFUSALS,
  isTestableStore,
  resolveTestPurchaseRefusal,
  resolveTestRestoreRefusal,
  type TestPurchaseConditions,
  type TestRestoreConditions,
} from '../test-store-purchase';

const STORE_OFFERING: PaywallOffering = {
  status: 'available',
  reference: 'offering-3',
  plans: [{ plan: 'annual', price: { amount: 49.99, currencyCode: 'USD' } }],
};

const OK: TestPurchaseConditions = {
  development: true,
  store: 'test-store',
  appleSandbox: false,
  authenticated: true,
  dedicatedTestAccount: false,
  offering: STORE_OFFERING,
  plan: 'annual',
  activity: undefined,
};

/** Apple Sandbox mode, a dedicated test account signed in. */
const SANDBOX_OK: TestPurchaseConditions = { ...OK, store: 'app-store', appleSandbox: true, dedicatedTestAccount: true };

describe('isTestableStore', () => {
  it('accepts the Test Store, and the App Store in Apple Sandbox mode only', () => {
    expect(isTestableStore('test-store', false)).toBe(true);
    expect(isTestableStore('test-store', true)).toBe(true);
    expect(isTestableStore('app-store', true)).toBe(true);
    expect(isTestableStore('app-store', false)).toBe(false);
    expect(isTestableStore(undefined, false)).toBe(false);
    expect(isTestableStore(undefined, true)).toBe(false);
  });
});

describe('resolveTestPurchaseRefusal — Test Store', () => {
  it('allows the purchase when every condition holds', () => {
    expect(resolveTestPurchaseRefusal(OK)).toBeUndefined();
  });

  it.each([
    ['not-development', { development: false }],
    ['store-not-testable', { store: 'app-store' }],
    ['store-not-testable', { store: undefined }],
    ['store-not-testable', { store: undefined, appleSandbox: true }],
    ['not-authenticated', { authenticated: false }],
    ['no-store-offering', { offering: paywallOfferingFixtures.frenchWithTrial }],
    ['no-store-offering', { offering: paywallOfferingFixtures.loading }],
    ['no-store-offering', { offering: paywallOfferingFixtures.storeUnavailable }],
    ['plan-not-offered', { plan: 'monthly' }],
    ['operation-in-progress', { activity: 'purchasing' }],
    ['operation-in-progress', { activity: 'restoring' }],
    ['operation-in-progress', { activity: 'verifying' }],
  ] as const)('refuses with %s when %o', (refusal, overrides) => {
    expect(resolveTestPurchaseRefusal({ ...OK, ...overrides })).toBe(refusal);
    expect(TEST_PURCHASE_REFUSALS[refusal]).toMatch(/\S/);
  });

  it('never asks the Test Store for a dedicated test account: the allowlist belongs to Apple Sandbox mode', () => {
    expect(resolveTestPurchaseRefusal({ ...OK, dedicatedTestAccount: false })).toBeUndefined();
  });

  it('checks the conditions in the order a developer can fix them: the build before the store before the account', () => {
    expect(resolveTestPurchaseRefusal({ ...OK, development: false, store: 'app-store', authenticated: false })).toBe('not-development');
    expect(resolveTestPurchaseRefusal({ ...OK, store: 'app-store', authenticated: false })).toBe('store-not-testable');
  });
});

describe('resolveTestPurchaseRefusal — Apple Sandbox mode (Phase 6.4B)', () => {
  it('allows the purchase for a dedicated test account when every condition holds', () => {
    expect(resolveTestPurchaseRefusal(SANDBOX_OK)).toBeUndefined();
  });

  it('refuses any account that is not a dedicated test account, before looking at the offering', () => {
    expect(resolveTestPurchaseRefusal({ ...SANDBOX_OK, dedicatedTestAccount: false })).toBe('not-test-account');
    expect(resolveTestPurchaseRefusal({ ...SANDBOX_OK, dedicatedTestAccount: false, offering: paywallOfferingFixtures.loading })).toBe(
      'not-test-account',
    );
    expect(TEST_PURCHASE_REFUSALS['not-test-account']).toMatch(/compte de test dédié/);
    expect(TEST_PURCHASE_REFUSALS['not-test-account']).toMatch(/Aucun achat/);
  });

  it('refuses the App Store without Apple Sandbox mode (a release shape), whatever the account', () => {
    expect(resolveTestPurchaseRefusal({ ...SANDBOX_OK, appleSandbox: false })).toBe('store-not-testable');
    expect(resolveTestPurchaseRefusal({ ...SANDBOX_OK, appleSandbox: false, dedicatedTestAccount: true })).toBe('store-not-testable');
    expect(TEST_PURCHASE_REFUSALS['store-not-testable']).toMatch(/Apple Sandbox/);
    expect(TEST_PURCHASE_REFUSALS['store-not-testable']).toMatch(/Aucun achat/);
  });

  it.each([
    ['not-development', { development: false }],
    ['not-authenticated', { authenticated: false }],
    ['no-store-offering', { offering: paywallOfferingFixtures.frenchWithTrial }],
    ['plan-not-offered', { plan: 'monthly' }],
    ['operation-in-progress', { activity: 'purchasing' }],
    ['operation-in-progress', { activity: 'restoring' }],
    ['operation-in-progress', { activity: 'verifying' }],
  ] as const)('keeps refusing with %s when %o', (refusal, overrides) => {
    expect(resolveTestPurchaseRefusal({ ...SANDBOX_OK, ...overrides })).toBe(refusal);
  });

  it('asks the account question only once signed in', () => {
    expect(resolveTestPurchaseRefusal({ ...SANDBOX_OK, authenticated: false, dedicatedTestAccount: false })).toBe('not-authenticated');
  });
});

const RESTORE_OK: TestRestoreConditions = {
  development: true,
  store: 'test-store',
  appleSandbox: false,
  authenticated: true,
  dedicatedTestAccount: false,
  activity: undefined,
};
const SANDBOX_RESTORE_OK: TestRestoreConditions = { ...RESTORE_OK, store: 'app-store', appleSandbox: true, dedicatedTestAccount: true };

describe('resolveTestRestoreRefusal', () => {
  it('allows the restore when every condition holds, in the Test Store and in Apple Sandbox mode', () => {
    expect(resolveTestRestoreRefusal(RESTORE_OK)).toBeUndefined();
    expect(resolveTestRestoreRefusal(SANDBOX_RESTORE_OK)).toBeUndefined();
  });

  it.each([
    ['not-development', { development: false }],
    ['store-not-testable', { store: 'app-store' }],
    ['store-not-testable', { store: undefined }],
    ['not-authenticated', { authenticated: false }],
    ['operation-in-progress', { activity: 'purchasing' }],
    ['operation-in-progress', { activity: 'restoring' }],
    ['operation-in-progress', { activity: 'verifying' }],
  ] as const)('refuses with %s when %o', (refusal, overrides) => {
    expect(resolveTestRestoreRefusal({ ...RESTORE_OK, ...overrides })).toBe(refusal);
    expect(TEST_RESTORE_REFUSALS[refusal]).toMatch(/\S/);
  });

  it('in Apple Sandbox mode, restores for a dedicated test account only', () => {
    expect(resolveTestRestoreRefusal({ ...SANDBOX_RESTORE_OK, dedicatedTestAccount: false })).toBe('not-test-account');
    expect(resolveTestRestoreRefusal({ ...SANDBOX_RESTORE_OK, activity: 'restoring' })).toBe('operation-in-progress');
    expect(TEST_RESTORE_REFUSALS['not-test-account']).toMatch(/Aucune restauration/);
    expect(TEST_RESTORE_REFUSALS['store-not-testable']).toMatch(/Apple Sandbox/);
    expect(TEST_RESTORE_REFUSALS['store-not-testable']).toMatch(/Aucune restauration/);
  });

  it('names no account in any sentence', () => {
    for (const sentence of [...Object.values(TEST_PURCHASE_REFUSALS), ...Object.values(TEST_RESTORE_REFUSALS)]) {
      expect(sentence).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(sentence).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    }
  });
});
