// BeautIzzy — THE origin the app links a public page to, per runtime

import {
  publicPageLinkOf,
  resolvePublicWebOrigin,
  type WebOriginRuntime,
} from '../public-page-url';

const iosSimulator = { platform: 'ios', isPhysicalDevice: false, isDevelopmentBuild: true } as const;
const androidEmulator = { platform: 'android', isPhysicalDevice: false, isDevelopmentBuild: true } as const;
const androidPhone = { platform: 'android', isPhysicalDevice: true, isDevelopmentBuild: true } as const;
const iPhone = { platform: 'ios', isPhysicalDevice: true, isDevelopmentBuild: true } as const;
const releaseAndroid = { platform: 'android', isPhysicalDevice: true, isDevelopmentBuild: false } as const;
const releaseIos = { platform: 'ios', isPhysicalDevice: true, isDevelopmentBuild: false } as const;

type Device = Omit<WebOriginRuntime, 'configuredOrigin' | 'deviceOrigin'>;

const resolve = (device: Device, configuredOrigin: string | undefined, deviceOrigin?: string) =>
  resolvePublicWebOrigin({ ...device, configuredOrigin, deviceOrigin });

describe('public web origin — iOS Simulator', () => {
  it('keeps localhost: the simulator shares the computer’s network', () => {
    expect(resolve(iosSimulator, 'http://localhost:3000')).toEqual({
      status: 'AVAILABLE',
      origin: 'http://localhost:3000',
      audience: 'LOCAL',
    });
    expect(resolve(iosSimulator, 'http://127.0.0.1:3000')).toMatchObject({ origin: 'http://127.0.0.1:3000' });
  });

  it('turns the Android-only alias back into localhost', () => {
    expect(resolve(iosSimulator, 'http://10.0.2.2:3000')).toMatchObject({ origin: 'http://localhost:3000' });
  });

  it('never reads the physical-device origin', () => {
    expect(resolve(iosSimulator, 'http://localhost:3000', 'http://192.168.1.20:3000')).toMatchObject({
      origin: 'http://localhost:3000',
    });
  });
});

describe('public web origin — standard Android Emulator', () => {
  it('reaches the computer at 10.0.2.2, same scheme and port', () => {
    expect(resolve(androidEmulator, 'http://localhost:3000')).toEqual({
      status: 'AVAILABLE',
      origin: 'http://10.0.2.2:3000',
      audience: 'LOCAL',
    });
    expect(resolve(androidEmulator, 'http://127.0.0.1:3001/')).toMatchObject({ origin: 'http://10.0.2.2:3001' });
    expect(resolve(androidEmulator, 'https://localhost')).toMatchObject({ origin: 'https://10.0.2.2' });
    expect(resolve(androidEmulator, 'http://10.0.2.2:3000')).toMatchObject({ origin: 'http://10.0.2.2:3000' });
  });

  it('never reads the physical-device origin', () => {
    expect(resolve(androidEmulator, 'http://localhost:3000', 'http://192.168.1.20:3000')).toMatchObject({
      origin: 'http://10.0.2.2:3000',
    });
  });
});

describe('public web origin — physical devices (development builds)', () => {
  it.each([
    ['Android', androidPhone],
    ['iOS', iPhone],
  ])('%s: never assumes localhost or 10.0.2.2 works — it asks for the device origin', (_label, device) => {
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://10.0.2.2:3000']) {
      expect(resolve(device, origin)).toEqual({ status: 'DEVICE_ORIGIN_REQUIRED' });
    }
  });

  it.each([
    ['Android', androidPhone],
    ['iOS', iPhone],
  ])('%s: uses the explicitly configured, reachable development host', (_label, device) => {
    expect(resolve(device, 'http://localhost:3000', 'http://192.168.1.20:3000/')).toEqual({
      status: 'AVAILABLE',
      origin: 'http://192.168.1.20:3000',
      audience: 'LOCAL',
    });
    expect(resolve(device, 'http://localhost:3000', 'http://mac-de-lea.local:3000')).toMatchObject({
      origin: 'http://mac-de-lea.local:3000',
      audience: 'LOCAL',
    });
  });

  it('refuses a device origin the device cannot reach either', () => {
    for (const unreachable of ['http://localhost:3000', 'http://10.0.2.2:3000', 'http://127.0.0.1:3000', 'not a url', '']) {
      expect(resolve(androidPhone, 'http://localhost:3000', unreachable)).toEqual({ status: 'DEVICE_ORIGIN_REQUIRED' });
    }
  });

  it('keeps a private-network origin configured directly: it is reachable as it is', () => {
    for (const device of [androidPhone, iPhone, androidEmulator, iosSimulator]) {
      expect(resolve(device, 'http://192.168.1.20:3000')).toMatchObject({
        origin: 'http://192.168.1.20:3000',
        audience: 'LOCAL',
      });
    }
  });
});

describe('public web origin — production and release builds', () => {
  const everyRuntime = [iosSimulator, androidEmulator, androidPhone, iPhone, releaseAndroid, releaseIos];

  it('the production website is PUBLIC and identical everywhere', () => {
    for (const device of everyRuntime) {
      expect(resolve(device, 'https://beautizzy.fr', 'http://192.168.1.20:3000')).toEqual({
        status: 'AVAILABLE',
        origin: 'https://beautizzy.fr',
        audience: 'PUBLIC',
      });
    }
  });

  it('a remote test origin stays a TEST origin everywhere, release builds included', () => {
    for (const device of everyRuntime) {
      expect(resolve(device, 'https://staging.beautizzy.fr')).toEqual({
        status: 'AVAILABLE',
        origin: 'https://staging.beautizzy.fr',
        audience: 'TEST',
      });
    }
  });

  it('a release build never shows the developer’s computer, nor reads the device origin', () => {
    for (const device of [releaseAndroid, releaseIos, { ...androidEmulator, isDevelopmentBuild: false }]) {
      for (const origin of ['http://localhost:3000', 'http://10.0.2.2:3000', 'http://192.168.1.20:3000']) {
        expect(resolve(device, origin, 'http://192.168.1.20:3000')).toEqual({ status: 'NOT_CONFIGURED' });
      }
    }
  });

  it('never presents a local or emulator address as public', () => {
    for (const device of everyRuntime) {
      for (const origin of ['http://localhost:3000', 'http://10.0.2.2:3000', 'http://192.168.1.20:3000', 'https://localhost']) {
        const resolved = resolve(device, origin, 'https://192.168.1.20');
        expect(resolved.status === 'AVAILABLE' ? resolved.audience : 'NONE').not.toBe('PUBLIC');
      }
    }
  });

  it('never invents an origin', () => {
    for (const origin of [undefined, '', 'beautizzy.fr', 'https://beautizzy.fr/path']) {
      expect(resolve(iosSimulator, origin, 'http://192.168.1.20:3000')).toEqual({ status: 'NOT_CONFIGURED' });
    }
  });
});

describe('public page link', () => {
  it('appends the page path to the resolved origin, and nothing without one', () => {
    expect(publicPageLinkOf(resolve(androidEmulator, 'http://localhost:3000'), 'maison-lea')).toEqual({
      url: 'http://10.0.2.2:3000/r/maison-lea',
      audience: 'LOCAL',
    });
    expect(publicPageLinkOf(resolve(androidPhone, 'http://localhost:3000'), 'maison-lea')).toBeUndefined();
    expect(publicPageLinkOf({ status: 'NOT_CONFIGURED' }, 'maison-lea')).toBeUndefined();
  });
});
