// BeautIzzy — the paywall presentation must stay a presentation (Phase 5).
//
// Guarded at the source level, like the development sync control:
//
//   * the application holds NO price: the intended French prices and the
//     14-day trial live in the test fixtures only, which no product module
//     imports;
//   * the development preview — the only product-side consumer of the
//     fixtures — is loaded by PlusScreen alone, through a `require` inside a
//     `__DEV__` branch, so Metro drops it (and the fixtures) from releases;
//     its live entry reads the real offering through `usePaywallOffering`
//     and transacts through `usePlusCheckout` (the provider's `purchase` /
//     `restore`), never through a store SDK; a fixture scenario carries no
//     store reference and can never reach a purchase;
//   * the paywall modules fetch nothing, initialize no store SDK, purchase
//     nothing themselves, write no subscription state and never touch the
//     enforcement switch, which stays `disabled`;
//   * the paywall is reachable from NO product route: the account-scoped
//     routing belongs to a later phase, and no product screen calls the
//     checkout hook.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSCRIPTION_ENFORCEMENT } from '../../enforcement';

const SRC = join(__dirname, '..', '..', '..', '..');

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (!statSync(path).isFile()) {
      return name === '__tests__' || name === 'testing' ? [] : listSourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files: readonly SourceFile[] = listSourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).split('\\').join('/'),
  source: readFileSync(path, 'utf8'),
}));

const paywallFiles = files.filter((file) => file.path.startsWith('features/access/paywall/'));
const productPaywallFiles = paywallFiles.filter((file) => !file.path.startsWith('features/access/paywall/development/'));

describe('paywall presentation — production boundary', () => {
  it('scans the paywall sources', () => {
    expect(productPaywallFiles.map((file) => file.path).sort()).toEqual([
      'features/access/paywall/PaywallScreen.tsx',
      'features/access/paywall/checkout-presentation.ts',
      'features/access/paywall/components/PaywallBenefitRow.tsx',
      'features/access/paywall/components/PaywallNotice.tsx',
      'features/access/paywall/components/PaywallPlanCard.tsx',
      'features/access/paywall/components/PlusBrandBadge.tsx',
      'features/access/paywall/paywall-copy.ts',
      'features/access/paywall/paywall-illustration.ts',
      'features/access/paywall/paywall-offering.ts',
      'features/access/paywall/paywall-presentation.ts',
    ]);
  });

  it('enforcement stays disabled', () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const enforcement = files.find((file) => file.path === 'features/access/enforcement.ts')!.source;
    expect(enforcement).toMatch(/export const SUBSCRIPTION_ENFORCEMENT: AccessEnforcement = 'disabled';/);
  });

  it('no product module writes a subscription price, a trial length, a store product identifier or a URL', () => {
    for (const file of productPaywallFiles) {
      expect({ path: file.path, price: /12[.,]99|\b129\b|14[.,]99|149[.,]99/.test(file.source) }).toEqual({ path: file.path, price: false });
      expect({ path: file.path, trial: /\b14\s*(jours|days|-day)\b/.test(file.source) }).toEqual({ path: file.path, trial: false });
      expect({ path: file.path, productId: /com\.[a-z]+\.[a-z]+\.(monthly|annual|plus)|\bsku\b|productIdentifier/i.test(file.source) }).toEqual({ path: file.path, productId: false });
      expect({ path: file.path, url: /https?:\/\//.test(file.source) }).toEqual({ path: file.path, url: false });
    }
  });

  it('the fixtures are imported by the development preview and the tests only', () => {
    const importers = files
      .filter((file) => /paywall\/testing\/|\.\.\/testing\/paywall-fixtures|\.\/testing\/paywall-fixtures/.test(file.source))
      .map((file) => file.path);
    expect(importers).toEqual(['features/access/paywall/development/PaywallPreviewSheet.tsx']);
  });

  it('the preview is loaded by PlusScreen only, through a require inside a __DEV__ branch', () => {
    const referencing = files
      .filter((file) => !file.path.startsWith('features/access/paywall/development/'))
      .filter((file) => /paywall\/development/.test(file.source))
      .map((file) => file.path);
    expect(referencing).toEqual(['features/plus/PlusScreen.tsx']);

    const plus = files.find((file) => file.path === 'features/plus/PlusScreen.tsx')!.source;
    expect(plus).not.toMatch(/^import[^;]*paywall\/development/m);
    expect(plus).toMatch(
      /const PaywallPreviewSheet = __DEV__\s*\?[^;]*require\('@\/features\/access\/paywall\/development\/PaywallPreviewSheet'\)[^;]*:\s*undefined;/,
    );
    const preview = files.find((file) => file.path === 'features/access/paywall/development/PaywallPreviewSheet.tsx')!.source;
    expect(preview).toMatch(/if \(!__DEV__\) return null;/);
    expect(preview).not.toMatch(/SUBSCRIPTION_ENFORCEMENT|useBusinessAccess|resolveBusinessAccess/);
    // The live entry: the offering hook and the checkout hook only — no SDK, no store, no source.
    expect(preview).toContain("from '../../session/use-paywall-offering'");
    expect(preview).toContain("from '../../session/use-plus-checkout'");
    expect(preview).not.toMatch(/purchasePackage|restorePurchases|infrastructure\/revenuecat|subscription-source|react-native-purchases/);
    // The Test Store purchase is guarded (every condition) and confirmed before the coordinator is asked…
    expect(preview).toMatch(/resolveTestPurchaseRefusal\(\{\s*development: __DEV__,\s*store: checkout\.store,/);
    expect(preview).toMatch(/Alert\.alert\(TEST_PURCHASE_TITLE,[\s\S]*?onPress: \(\) => onPurchase\(\{ offering, plan \}\)/);
    // …which buys ONCE, from the always-mounted sheet, in the `checkout` stage only — never from the paywall it presents.
    expect(preview.match(/\.purchase\(/g)).toHaveLength(1);
    expect(preview).toMatch(/stage\.kind !== 'checkout' \|\| startedRequest\.current === stage\.request\) return;[\s\S]*?checkoutRef\.current\.purchase\(request\.offering, request\.plan\)/);
    // The paywall Modal and the SDK dialog never overlap: the Modal is presented in the paywall stages only.
    expect(preview).toMatch(/visible=\{visible && stage\.kind === 'paywall'\}/);
    expect(preview).toMatch(/if \(stage\.kind === 'checkout-closing'\) setStage\(\{ kind: 'checkout', request: stage\.request \}\);/);
    // The fixture scenarios keep their inert purchase action.
    expect(preview).toMatch(/onSubscribe=\{explainNoPurchase\}/);
  });

  it('no product module starts a checkout: the hook is consumed by the development preview only', () => {
    const consumers = files.filter((file) => /usePlusCheckout\s*\(/.test(file.source)).map((file) => file.path).sort();
    expect(consumers).toEqual(['features/access/paywall/development/PaywallPreviewSheet.tsx', 'features/access/session/use-plus-checkout.ts']);
    const screen = files.find((file) => file.path === 'features/access/paywall/PaywallScreen.tsx')!.source;
    expect(screen).not.toMatch(/usePlusCheckout|usePaywallOffering|purchase\(|restore\(/);
  });

  it('the paywall modules touch no store, no network, no persistence and no access state', () => {
    for (const file of paywallFiles) {
      expect({
        path: file.path,
        store: /react-native-purchases|@revenuecat\/|StoreKit|Purchases\.|fetch\(|supabase|expo-sqlite|AsyncStorage/i.test(file.source),
      }).toEqual({ path: file.path, store: false });
      expect({
        path: file.path,
        access: /useBusinessAccess|BusinessAccessProvider['"]|SUBSCRIPTION_ENFORCEMENT|updateEntitlementEvidence/.test(file.source),
      }).toEqual({ path: file.path, access: false });
      expect({ path: file.path, logs: /console\./.test(file.source) }).toEqual({ path: file.path, logs: false });
    }
  });

  it('no product route mounts the paywall: the routing phase comes later', () => {
    const routes = files.filter((file) => file.path.startsWith('app/'));
    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) {
      expect({ path: route.path, paywall: /paywall|Paywall/.test(route.source) }).toEqual({ path: route.path, paywall: false });
    }
    const navigator = files.find((file) => file.path === 'providers/RootNavigator.tsx')!.source;
    expect(navigator).not.toMatch(/paywall|Paywall|useBusinessAccess/);
    const rootRoute = files.find((file) => file.path === 'providers/root-route.ts')!.source;
    expect(rootRoute).not.toMatch(/paywall|access|subscription/i);
  });
});
