/* global describe, it, expect */
const {
  buildDevClientUrl,
  describeMetroManifest,
  getAdbCandidates,
  getDevClientScheme,
  parseAdbDevices,
  parseBootedSimulators,
} = require('./dev');

describe('npm run dev launcher', () => {
  it('builds the Expo development-client URL from the LAN address', () => {
    expect(buildDevClientUrl(getDevClientScheme('souris-app'), '192.168.1.42', 8081)).toBe(
      'exp+souris-app://expo-development-client/?url=http%3A%2F%2F192.168.1.42%3A8081',
    );
  });

  it('keeps only online adb devices', () => {
    const output = [
      'List of devices attached',
      'emulator-5556\tdevice product:sdk_gphone16k_arm64 model:sdk_gphone16k_arm64 transport_id:5',
      'emulator-5554\toffline',
      'ZY22ABC\tunauthorized',
      '',
    ].join('\n');
    expect(parseAdbDevices(output)).toEqual(['emulator-5556']);
  });

  it('keeps only booted simulators', () => {
    const json = JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-4': [
          { udid: 'A', name: 'iPhone 17', state: 'Booted' },
          { udid: 'B', name: 'iPhone 17 Pro', state: 'Shutdown' },
        ],
        'com.apple.CoreSimulator.SimRuntime.watchOS-26-4': [],
      },
    });
    expect(parseBootedSimulators(json)).toEqual([{ udid: 'A', name: 'iPhone 17' }]);
  });

  it('reuses a Metro server only for this project and the development variant', () => {
    const manifest = (expoClient) => ({ extra: { expoClient } });
    expect(
      describeMetroManifest(
        manifest({ slug: 'souris-app', name: 'BeautIzzy Dev', ios: { bundleIdentifier: 'com.mortyflex.sourisapp.dev' } }),
        'souris-app',
      ),
    ).toEqual({ compatible: true, name: 'BeautIzzy Dev' });
    expect(
      describeMetroManifest(
        manifest({ slug: 'souris-app', name: 'BeautIzzy', ios: { bundleIdentifier: 'com.mortyflex.sourisapp' } }),
        'souris-app',
      ).compatible,
    ).toBe(false);
    expect(
      describeMetroManifest(
        manifest({ slug: 'other-app', ios: { bundleIdentifier: 'com.mortyflex.sourisapp.dev' } }),
        'souris-app',
      ).compatible,
    ).toBe(false);
    expect(describeMetroManifest(null, 'souris-app').compatible).toBe(false);
  });

  it('looks for adb in the SDK locations, environment first', () => {
    expect(getAdbCandidates({ ANDROID_HOME: '/sdk' }, '/Users/me').map(({ adb }) => adb)).toEqual([
      '/sdk/platform-tools/adb',
      '/Users/me/Library/Android/sdk/platform-tools/adb',
    ]);
  });
});
