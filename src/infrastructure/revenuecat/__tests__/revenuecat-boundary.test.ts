// BeautIzzy — the RevenueCat integration stays bounded (source-level guard,
// like paywall-boundary.test.ts): one module binds the SDK; offerings, the
// eligibility check, the package purchase and the restore go through that
// module only, from the source only; no product module syncs or logs out; the
// only purchase entry point is the development preview, through the provider;
// purchases are enabled for the Test Store only; no key or account is
// hardcoded; the environment files stay out of git; the root wiring and the
// enforcement switch are untouched.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';

const SRC = join(__dirname, '..', '..', '..');
const ROOT = join(SRC, '..');

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

describe('RevenueCat integration — Phase 6.1 / 6.2 boundary', () => {
  it('scans the application sources', () => {
    expect(files.length).toBeGreaterThan(150);
    expect(files.map((file) => file.path).filter((path) => path.startsWith('infrastructure/revenuecat/')).sort()).toEqual([
      'infrastructure/revenuecat/config.ts',
      'infrastructure/revenuecat/customer-info.ts',
      'infrastructure/revenuecat/index.ts',
      'infrastructure/revenuecat/offering.ts',
      'infrastructure/revenuecat/purchase-error.ts',
      'infrastructure/revenuecat/sdk.ts',
      'infrastructure/revenuecat/subscription-source.ts',
    ]);
  });

  it('enforcement stays disabled', () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const enforcement = files.find((file) => file.path === 'features/access/enforcement.ts')!.source;
    expect(enforcement).toMatch(/export const SUBSCRIPTION_ENFORCEMENT: AccessEnforcement = 'disabled';/);
  });

  it('binds the SDK at runtime in ONE module; every other module imports types only', () => {
    const runtimeImporters = files
      .filter((file) => /^import (?!type )[^;]*from ['"]react-native-purchases['"]/m.test(file.source))
      .map((file) => file.path);
    expect(runtimeImporters).toEqual(['infrastructure/revenuecat/sdk.ts']);
    const anyImporters = files.filter((file) => /react-native-purchases/.test(file.source)).map((file) => file.path);
    expect(anyImporters.every((path) => path.startsWith('infrastructure/revenuecat/'))).toBe(true);
  });

  it('buys a PACKAGE and restores through the SDK facade only, from the source only; every other billing call is bound nowhere', () => {
    const sdkCallers = files
      .filter((file) => /\bPurchases\.(purchasePackage|restorePurchases)\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(sdkCallers).toEqual(['infrastructure/revenuecat/sdk.ts']);
    const facadeCallers = files
      .filter((file) => /\bsdk\.(purchasePackage|restorePurchases)\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(facadeCallers).toEqual(['infrastructure/revenuecat/subscription-source.ts']);
    for (const file of files) {
      expect({
        path: file.path,
        billing: /\b(purchaseProduct|purchaseStoreProduct|purchaseSubscriptionOption|purchaseDiscountedPackage|purchaseDiscountedProduct|purchasePackageWithWinBackOffer|purchaseProductWithWinBackOffer|syncPurchases|syncPurchasesForResult|logOut|presentCodeRedemptionSheet|getPromotionalOffer)\s*\(/.test(file.source),
      }).toEqual({ path: file.path, billing: false });
      if (!file.path.startsWith('infrastructure/revenuecat/')) {
        expect({ path: file.path, sdkBilling: /\b(purchasePackage|restorePurchases)\s*\(/.test(file.source) }).toEqual({ path: file.path, sdkBilling: false });
      }
    }
  });

  it('the purchase and the restore reach the source through the provider only, and the ONLY purchase entry point is the development preview', () => {
    const sourceCallers = files
      .filter((file) => /\bsource\??\.(purchase|restore)\b/.test(file.source) && !file.path.startsWith('infrastructure/revenuecat/'))
      .map((file) => file.path)
      .sort();
    expect(sourceCallers).toEqual(['features/access/session/BusinessAccessProvider.tsx']);
    // The checkout hook is the only reader of the provider's transactions…
    const providerCallers = files
      .filter((file) => /accessRef\.current\.(purchase|restore)\(|\bpurchase: \(request/.test(file.source))
      .map((file) => file.path)
      .sort();
    expect(providerCallers).toEqual(['features/access/session/BusinessAccessProvider.tsx', 'features/access/session/use-plus-checkout.ts']);
    // …and the development preview its only consumer: no product screen, no route.
    const checkoutConsumers = files.filter((file) => /usePlusCheckout\s*\(/.test(file.source)).map((file) => file.path).sort();
    expect(checkoutConsumers).toEqual([
      'features/access/paywall/development/PaywallPreviewSheet.tsx',
      'features/access/session/use-plus-checkout.ts',
    ]);
  });

  it('purchases are enabled for the RevenueCat Test Store only: a release bound to the App Store starts no transaction', () => {
    const policy = files.find((file) => file.path === 'features/access/purchasable-stores.ts')!.source;
    expect(policy).toMatch(/export const PURCHASABLE_STORES: readonly SubscriptionStoreKind\[\] = \['test-store'\];/);
    const provider = files.find((file) => file.path === 'features/access/session/BusinessAccessProvider.tsx')!.source;
    expect(provider).toMatch(/operation === 'purchase' && !isPurchasableStore\(store\)\) return failed\('not-enabled'\)/);
    // Nothing restores automatically: the only `restore` calls are user-initiated through the hook.
    expect(provider).not.toMatch(/restore\(\)/);
    const hook = files.find((file) => file.path === 'features/access/session/use-plus-checkout.ts')!.source;
    expect(hook).not.toMatch(/useEffect\([^)]*restore/);
  });

  it('reads the offerings and the trial eligibility through the SDK facade only, from the source only', () => {
    const sdkReaders = files
      .filter((file) => /\bPurchases\.(getOfferings|checkTrialOrIntroductoryPriceEligibility)\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(sdkReaders).toEqual(['infrastructure/revenuecat/sdk.ts']);
    const facadeReaders = files
      .filter((file) => /\bsdk\.(getOfferings|checkTrialOrIntroductoryPriceEligibility)\s*\(/.test(file.source))
      .map((file) => file.path);
    expect(facadeReaders).toEqual(['infrastructure/revenuecat/subscription-source.ts']);
    // The paywall learns the offering through the provider's `loadOffering`, never from the SDK.
    const offeringConsumers = files
      .filter((file) => /\bloadOffering\b/.test(file.source) && !file.path.startsWith('infrastructure/revenuecat/'))
      .map((file) => file.path)
      .sort();
    expect(offeringConsumers).toEqual([
      'features/access/session/BusinessAccessProvider.tsx',
      'features/access/session/use-paywall-offering.ts',
      'features/access/subscription-source.ts',
    ]);
  });

  it('the root wires the source through the provider only: no second subscription state, no routing change', () => {
    const layout = files.find((file) => file.path === 'app/_layout.tsx')!.source;
    expect(layout).toContain("import { createAccountSubscriptionSource } from '@/infrastructure/revenuecat';");
    expect(layout).toContain('source={subscriptionSource}');
    expect(layout).toContain('enforcement={SUBSCRIPTION_ENFORCEMENT}');
    expect(layout).not.toMatch(/react-native-purchases|Purchases\./);
    const consumers = files.filter((file) => /infrastructure\/revenuecat/.test(file.source) && !file.path.startsWith('infrastructure/revenuecat/')).map((file) => file.path);
    expect(consumers).toEqual(['app/_layout.tsx']);
  });

  it('hardcodes no key, no account and no privileged secret', () => {
    for (const file of files) {
      expect({ path: file.path, key: /\b(appl|test|goog|amzn|sk)_[A-Za-z0-9]{16,}\b/.test(file.source) }).toEqual({ path: file.path, key: false });
    }
    for (const file of files.filter((entry) => entry.path.startsWith('infrastructure/revenuecat/'))) {
      expect({ path: file.path, uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(file.source) }).toEqual({ path: file.path, uuid: false });
      expect({ path: file.path, email: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(file.source) }).toEqual({ path: file.path, email: false });
      expect({ path: file.path, secret: /service_role|SERVICE_ROLE|sk_[a-z]/i.test(file.source) }).toEqual({ path: file.path, secret: false });
    }
    // The environment is read literally, in the configuration boundary only.
    const readers = files.filter((file) => /EXPO_PUBLIC_REVENUECAT_/.test(file.source)).map((file) => file.path);
    expect(readers).toEqual(['infrastructure/revenuecat/config.ts']);
  });

  it('keeps the environment files and Apple keys out of git', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^\*\.p8$/m);
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(example).toMatch(/^EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY=$/m);
    expect(example).toMatch(/^EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=$/m);
  });

  it('installs the core SDK only: no RevenueCat UI package', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.dependencies['react-native-purchases']).toBeDefined();
    expect(manifest.dependencies['react-native-purchases-ui']).toBeUndefined();
    expect(manifest.devDependencies['react-native-purchases-ui']).toBeUndefined();
  });
});
