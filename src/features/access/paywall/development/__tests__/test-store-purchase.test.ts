// BeautIzzy — the guard of the development Test Store purchase: every
// condition, each refusal with its own sentence, nothing about an account.

import type { PaywallOffering } from '../../paywall-offering';
import { paywallOfferingFixtures } from '../../testing/paywall-fixtures';
import {
  TEST_PURCHASE_REFUSALS,
  TEST_RESTORE_REFUSALS,
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
  authenticated: true,
  offering: STORE_OFFERING,
  plan: 'annual',
  activity: undefined,
};

describe('resolveTestPurchaseRefusal', () => {
  it('allows the purchase when every condition holds', () => {
    expect(resolveTestPurchaseRefusal(OK)).toBeUndefined();
  });

  it.each([
    ['not-development', { development: false }],
    ['not-test-store', { store: 'app-store' }],
    ['not-test-store', { store: undefined }],
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

  it('checks the conditions in the order a developer can fix them: the build before the store before the account', () => {
    expect(resolveTestPurchaseRefusal({ ...OK, development: false, store: 'app-store', authenticated: false })).toBe('not-development');
    expect(resolveTestPurchaseRefusal({ ...OK, store: 'app-store', authenticated: false })).toBe('not-test-store');
  });
});

// Phase 6.4A — the restore link is guarded like the purchase: a debug bundle
// bound to the App Store (Apple Sandbox mode) restores nothing.

const RESTORE_OK: TestRestoreConditions = { development: true, store: 'test-store', authenticated: true, activity: undefined };

describe('resolveTestRestoreRefusal', () => {
  it('allows the restore when every condition holds', () => {
    expect(resolveTestRestoreRefusal(RESTORE_OK)).toBeUndefined();
  });

  it.each([
    ['not-development', { development: false }],
    ['not-test-store', { store: 'app-store' }],
    ['not-test-store', { store: undefined }],
    ['not-authenticated', { authenticated: false }],
    ['operation-in-progress', { activity: 'purchasing' }],
    ['operation-in-progress', { activity: 'restoring' }],
    ['operation-in-progress', { activity: 'verifying' }],
  ] as const)('refuses with %s when %o', (refusal, overrides) => {
    expect(resolveTestRestoreRefusal({ ...RESTORE_OK, ...overrides })).toBe(refusal);
    expect(TEST_RESTORE_REFUSALS[refusal]).toMatch(/\S/);
  });

  it('names Apple Sandbox mode as read-only in both App Store refusals', () => {
    expect(TEST_PURCHASE_REFUSALS['not-test-store']).toMatch(/Apple Sandbox/);
    expect(TEST_PURCHASE_REFUSALS['not-test-store']).toMatch(/aucun achat/);
    expect(TEST_RESTORE_REFUSALS['not-test-store']).toMatch(/Apple Sandbox/);
    expect(TEST_RESTORE_REFUSALS['not-test-store']).toMatch(/aucune restauration/);
  });
});
