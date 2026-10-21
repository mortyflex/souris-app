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
//     (the provider's `loadOffering`), never through a store SDK, and can
//     call no purchase API because none is bound;
//   * the paywall modules fetch nothing, initialize no store SDK, purchase
//     nothing, write no subscription state and never touch the enforcement
//     switch, which stays `disabled`;
//   * the paywall is reachable from NO product route: the account-scoped
//     routing belongs to a later phase.

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
    // The live entry: the offering hook only — no purchase, no restore, no SDK.
    expect(preview).toContain("from '../../session/use-paywall-offering'");
    expect(preview).not.toMatch(/purchase[A-Z]\w*\(|restorePurchases|infrastructure\/revenuecat/);
  });

  it('the paywall modules touch no store, no network, no persistence and no access state', () => {
    for (const file of paywallFiles) {
      expect({
        path: file.path,
        store: /react-native-purchases|@revenuecat\/|StoreKit|Purchases\.|fetch\(|supabase|expo-sqlite|AsyncStorage/i.test(file.source),
      }).toEqual({ path: file.path, store: false });
      expect({
        path: file.path,
        access: /useBusinessAccess|BusinessAccessProvider|SUBSCRIPTION_ENFORCEMENT|updateEntitlementEvidence/.test(file.source),
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
