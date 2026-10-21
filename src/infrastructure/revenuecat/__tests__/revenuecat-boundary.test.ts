// BeautIzzy — Phase 6.1 stays a verification integration (source-level guard,
// like paywall-boundary.test.ts): one module binds the SDK, no product module
// purchases, restores, syncs or logs out, no key or account is hardcoded, the
// environment files stay out of git, the paywall and the enforcement switch
// are untouched.

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

describe('RevenueCat integration — Phase 6.1 boundary', () => {
  it('scans the application sources', () => {
    expect(files.length).toBeGreaterThan(150);
    expect(files.map((file) => file.path).filter((path) => path.startsWith('infrastructure/revenuecat/')).sort()).toEqual([
      'infrastructure/revenuecat/config.ts',
      'infrastructure/revenuecat/customer-info.ts',
      'infrastructure/revenuecat/index.ts',
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

  it('purchases, restores, syncs, fetches offerings and logs out nowhere', () => {
    for (const file of files) {
      expect({
        path: file.path,
        billing: /\b(purchasePackage|purchaseProduct|purchaseStoreProduct|purchaseDiscountedPackage|restorePurchases|syncPurchases|syncPurchasesForResult|getOfferings|logOut|presentCodeRedemptionSheet)\s*\(/.test(file.source),
      }).toEqual({ path: file.path, billing: false });
    }
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
