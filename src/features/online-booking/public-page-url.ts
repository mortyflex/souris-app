// BeautIzzy — the public address of a booking page
//
// THE resolver of the website origin the app links to: « Voir ma page », the
// address shown under the field and « Copier le lien » all go through
// `readPublicWebOrigin` + `publicPageLinkOf`, never through the variable
// directly. The origin is build-time public configuration
// (EXPO_PUBLIC_WEB_URL, referenced literally so Metro inlines it). While it
// is not configured the app shows the path of the page only and offers no
// link: it never invents a domain.
//
// Three audiences, never confused:
//
//   PUBLIC  https://beautizzy.fr (or www.) — the ONLY address clients can open
//   TEST    any other remote origin: Staging, a preview deployment
//   LOCAL   the developer's own computer: localhost, 127.0.0.1, 10.0.2.2,
//           a private-network address, a *.local name
//
// « this machine » (localhost, 127.0.0.1) means the developer's computer only
// where the app runs ON it. In a development build, such an origin is
// re-targeted for the runtime that will open it:
//
//   iOS Simulator      shares the computer's network: localhost as configured
//   Android Emulator   its own localhost is the emulator: the computer is 10.0.2.2
//   physical device    neither can work: EXPO_PUBLIC_WEB_DEVICE_URL, explicitly
//                      configured (http://<computer LAN address>:3000); without
//                      it, no link — 10.0.2.2 is never assumed
//
// A private-network address is reachable as configured and is never
// re-targeted. A release build never shows a LOCAL origin, whatever is
// configured, and EXPO_PUBLIC_WEB_DEVICE_URL is never read there.

import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** The hosts of the production website; anything else is a test origin. */
const PRODUCTION_WEB_HOSTS: readonly string[] = ['beautizzy.fr', 'www.beautizzy.fr'];

/** « This machine »: the developer's computer only when the app runs on it. */
const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

/** The standard Android Emulator's alias of the computer it runs on. */
export const ANDROID_EMULATOR_HOST = '10.0.2.2';

export type PublicPageAudience = 'PUBLIC' | 'TEST' | 'LOCAL';

export interface PublicPageLink {
  readonly url: string;
  /** PUBLIC only for the production website over https. */
  readonly audience: PublicPageAudience;
}

export type PublicWebOrigin =
  | { readonly status: 'AVAILABLE'; readonly origin: string; readonly audience: PublicPageAudience }
  /** Nothing usable is configured for this build. */
  | { readonly status: 'NOT_CONFIGURED' }
  /**
   * Development build on a physical device: the configured origin is the
   * developer's computer seen from itself, and no device-reachable origin
   * (EXPO_PUBLIC_WEB_DEVICE_URL) is configured.
   */
  | { readonly status: 'DEVICE_ORIGIN_REQUIRED' };

/** Everything the resolution depends on, read once from the running app (`readWebOriginRuntime`). */
export interface WebOriginRuntime {
  /** EXPO_PUBLIC_WEB_URL. */
  readonly configuredOrigin: string | undefined;
  /** EXPO_PUBLIC_WEB_DEVICE_URL — development builds on a physical device only. */
  readonly deviceOrigin: string | undefined;
  readonly platform: string;
  /** False on the iOS Simulator and the Android Emulator. */
  readonly isPhysicalDevice: boolean;
  readonly isDevelopmentBuild: boolean;
}

interface ParsedOrigin {
  readonly scheme: string;
  readonly host: string;
  /** « :3000 », or undefined for the scheme's default port. */
  readonly port: string | undefined;
}

function parseOrigin(text: string | undefined): ParsedOrigin | undefined {
  const trimmed = text?.trim().replace(/\/+$/, '') ?? '';
  const match = /^(https?):\/\/([^\s/:@]+)(:\d+)?$/i.exec(trimmed);
  if (match === null) return undefined;
  return { scheme: match[1].toLowerCase(), host: match[2].toLowerCase(), port: match[3] };
}

function isMachineAlias(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host) || host === ANDROID_EMULATOR_HOST;
}

function isPrivateNetworkHost(host: string): boolean {
  return (
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) ||
    host.endsWith('.local')
  );
}

function audienceOf(origin: ParsedOrigin): PublicPageAudience {
  if (origin.scheme === 'https' && origin.port === undefined && PRODUCTION_WEB_HOSTS.includes(origin.host)) {
    return 'PUBLIC';
  }
  return isMachineAlias(origin.host) || isPrivateNetworkHost(origin.host) ? 'LOCAL' : 'TEST';
}

function available(origin: ParsedOrigin): PublicWebOrigin {
  return {
    status: 'AVAILABLE',
    origin: `${origin.scheme}://${origin.host}${origin.port ?? ''}`,
    audience: audienceOf(origin),
  };
}

/** Pure, exported for tests: THE origin this runtime links to. */
export function resolvePublicWebOrigin(runtime: WebOriginRuntime): PublicWebOrigin {
  const configured = parseOrigin(runtime.configuredOrigin);
  if (configured === undefined) return { status: 'NOT_CONFIGURED' };
  if (audienceOf(configured) !== 'LOCAL') return available(configured);

  // The developer's computer: never in a release build.
  if (!runtime.isDevelopmentBuild) return { status: 'NOT_CONFIGURED' };
  // A private-network address is reachable as it is, from every runtime on that network.
  if (!isMachineAlias(configured.host)) return available(configured);

  if (runtime.isPhysicalDevice) {
    const device = parseOrigin(runtime.deviceOrigin);
    if (device === undefined || isMachineAlias(device.host)) return { status: 'DEVICE_ORIGIN_REQUIRED' };
    return available(device);
  }
  if (runtime.platform === 'android') return available({ ...configured, host: ANDROID_EMULATOR_HOST });
  // The iOS Simulator reaches the computer as localhost.
  return available(configured.host === ANDROID_EMULATOR_HOST ? { ...configured, host: 'localhost' } : configured);
}

/** The link of `slug` on a resolved origin, or undefined without one. */
export function publicPageLinkOf(origin: PublicWebOrigin, slug: string): PublicPageLink | undefined {
  return origin.status === 'AVAILABLE' ? { url: `${origin.origin}/r/${slug}`, audience: origin.audience } : undefined;
}

/** Pure, exported for tests: the link of `slug` on this exact origin, without any re-targeting. */
export function resolvePublicPageLink(origin: string | undefined, slug: string): PublicPageLink | undefined {
  const parsed = parseOrigin(origin);
  return parsed !== undefined ? publicPageLinkOf(available(parsed), slug) : undefined;
}

export function publicPagePath(slug: string): string {
  return `/r/${slug}`;
}

export function readWebOriginRuntime(): WebOriginRuntime {
  return {
    configuredOrigin: process.env.EXPO_PUBLIC_WEB_URL,
    deviceOrigin: process.env.EXPO_PUBLIC_WEB_DEVICE_URL,
    platform: Platform.OS,
    isPhysicalDevice: Device.isDevice,
    isDevelopmentBuild: __DEV__,
  };
}

/** The origin the running app links to; pair it with `publicPageLinkOf` for a page. */
export function readPublicWebOrigin(): PublicWebOrigin {
  return resolvePublicWebOrigin(readWebOriginRuntime());
}
