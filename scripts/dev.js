#!/usr/bin/env node
'use strict';
/* global __dirname */

// BeautIzzy — one-command development launcher: `npm run dev`.
//
// ONE Metro server, started in LAN mode with the development variant, shared by
// the iOS Simulator, the Android Emulator and the physical iPhone (QR code):
//
//   APP_VARIANT=development NODE_OPTIONS=--dns-result-order=ipv4first expo start --dev-client --lan
//
// Once Metro answers, the installed development builds (BeautIzzy Dev,
// `com.mortyflex.sourisapp.dev`) are opened on every booted simulator and every
// online Android device with the Expo development-client URL, addressed by their
// identifier — never through Expo's `i` / `a` shortcuts, which look for the bundle
// identifier of the native project currently generated under ios/ and android/.
//
// The LAN address is discovered at every start from the same library Expo uses
// to advertise its URL (`lan-network`), then verified against Metro, so a Wi-Fi
// change only needs a restart. Nothing is built, installed, reset or uninstalled.
//
// Plain Node, no dependency: run with `node scripts/dev.js`.

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const APP_VARIANT = 'development';
// app.config.js: the identifier of the `development` variant, on both platforms.
const DEV_APPLICATION_ID = 'com.mortyflex.sourisapp.dev';
const METRO_PORT = 8081;
const METRO_READY_TIMEOUT_MS = 120_000;
const METRO_POLL_INTERVAL_MS = 500;
const HTTP_TIMEOUT_MS = 2_000;
// Android Emulator alias for the host loopback, used only when no LAN address exists.
const ANDROID_EMULATOR_HOST_LOOPBACK = '10.0.2.2';

const log = (message) => console.log(`[dev] ${message}`);
const warn = (message) => console.warn(`[dev] ${message}`);

// ---------------------------------------------------------------------------
// Pure helpers (covered by scripts/dev.test.js)
// ---------------------------------------------------------------------------

/** The scheme expo-dev-client registers for this project: `exp+<slug>`. */
function getDevClientScheme(slug) {
  return `exp+${slug}`;
}

/** Same shape as Expo CLI's `constructDevClientUrl`. */
function buildDevClientUrl(scheme, host, port) {
  const manifestUrl = `http://${host}:${port}`;
  return `${scheme}://expo-development-client/?url=${encodeURIComponent(manifestUrl)}`;
}

/** `adb devices` → the serials of the devices that are online (state `device`). */
function parseAdbDevices(output) {
  return output
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0]);
}

/** `xcrun simctl list devices booted -j` → `{ udid, name }` of every booted simulator. */
function parseBootedSimulators(json) {
  const runtimes = JSON.parse(json).devices ?? {};
  return Object.values(runtimes)
    .flat()
    .filter((device) => device.state === 'Booted')
    .map((device) => ({ udid: device.udid, name: device.name }));
}

/**
 * Whether a Metro manifest comes from THIS project, evaluated for the
 * development variant (so the running server serves BeautIzzy Dev).
 */
function describeMetroManifest(manifest, slug) {
  const client = manifest?.extra?.expoClient;
  if (!client) {
    return { compatible: false, reason: 'its manifest is not an Expo manifest' };
  }
  if (client.slug !== slug) {
    return { compatible: false, reason: `it serves another project (slug "${client.slug}")` };
  }
  if (client.ios?.bundleIdentifier !== DEV_APPLICATION_ID) {
    return {
      compatible: false,
      reason: `it was started without APP_VARIANT=${APP_VARIANT} (${client.ios?.bundleIdentifier ?? 'no bundle identifier'})`,
    };
  }
  return { compatible: true, name: client.name };
}

/** Where adb may live when it is not on the PATH, most specific first. */
function getAdbCandidates(env, homeDir) {
  return [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, path.join(homeDir, 'Library/Android/sdk')]
    .filter(Boolean)
    .map((sdkRoot) => ({ sdkRoot, adb: path.join(sdkRoot, 'platform-tools/adb') }));
}

// ---------------------------------------------------------------------------
// Metro
// ---------------------------------------------------------------------------

function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    const request = http.get(url, { headers, timeout: HTTP_TIMEOUT_MS }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

async function isMetroRunning(host) {
  const response = await httpGet(`http://${host}:${METRO_PORT}/status`);
  return response?.body === 'packager-status:running';
}

async function fetchMetroManifest(host) {
  const response = await httpGet(`http://${host}:${METRO_PORT}/`, { 'expo-platform': 'ios' });
  if (!response || response.status !== 200) return null;
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = http.get({ host: '127.0.0.1', port, path: '/status', timeout: HTTP_TIMEOUT_MS });
    probe.on('response', (response) => {
      response.resume();
      resolve(false);
    });
    probe.on('timeout', () => probe.destroy(new Error('timeout')));
    probe.on('error', (error) => resolve(error.code === 'ECONNREFUSED'));
  });
}

/** The LAN address Expo advertises: the same `lan-network` lookup, resolved from Expo's own CLI. */
async function resolveLanAddress() {
  try {
    const expoDir = path.dirname(require.resolve('expo/package.json', { paths: [PROJECT_ROOT] }));
    const cliPackage = require.resolve('@expo/cli/package.json', { paths: [expoDir] });
    const { lanNetwork } = createRequire(cliPackage)('lan-network');
    const network = await lanNetwork();
    if (network?.address && !network.internal) return network.address;
  } catch {
    // Fall through to the interface scan.
  }
  for (const addresses of Object.values(os.networkInterfaces())) {
    const lan = addresses?.find((address) => address.family === 'IPv4' && !address.internal);
    if (lan) return lan.address;
  }
  return null;
}

function startMetro() {
  const nodeOptions = [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' ');
  const env = { ...process.env, APP_VARIANT, NODE_OPTIONS: nodeOptions };
  // Let Expo's own Android tooling (adb reverse, the `a` shortcut) find the SDK too.
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
    const sdk = getAdbCandidates(env, os.homedir()).find(({ adb }) => fs.existsSync(adb));
    if (sdk) env.ANDROID_HOME = sdk.sdkRoot;
  }
  const expoCli = require.resolve('expo/bin/cli', { paths: [PROJECT_ROOT] });
  return spawn(process.execPath, [expoCli, 'start', '--dev-client', '--lan'], {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
  });
}

function waitForMetro(child) {
  const deadline = Date.now() + METRO_READY_TIMEOUT_MS;
  return new Promise((resolve) => {
    let exited = false;
    child.once('exit', () => {
      exited = true;
      resolve(false);
    });
    const poll = async () => {
      if (exited) return;
      if (await isMetroRunning('127.0.0.1')) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(poll, METRO_POLL_INTERVAL_MS);
    };
    poll();
  });
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { ok: result.status === 0 && !result.error, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function openIosSimulators(devClientUrl) {
  const list = run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']);
  if (!list.ok) {
    warn('iOS Simulator: xcrun simctl is unavailable (install Xcode and its command line tools).');
    return;
  }
  const simulators = parseBootedSimulators(list.stdout);
  if (simulators.length === 0) {
    warn('iOS Simulator: none is booted. Open Simulator.app, then press i in Metro or rerun npm run dev.');
    return;
  }
  for (const { udid, name } of simulators) {
    if (!run('xcrun', ['simctl', 'get_app_container', udid, DEV_APPLICATION_ID]).ok) {
      warn(
        `iOS Simulator "${name}": BeautIzzy Dev (${DEV_APPLICATION_ID}) is not installed. ` +
          `Build it once with APP_VARIANT=${APP_VARIANT} npx expo run:ios.`,
      );
      continue;
    }
    const open = run('xcrun', ['simctl', 'openurl', udid, devClientUrl]);
    if (open.ok) {
      log(`iOS Simulator "${name}": opened BeautIzzy Dev.`);
    } else {
      warn(`iOS Simulator "${name}": could not open BeautIzzy Dev. ${open.stderr.trim()}`);
    }
  }
}

function findAdb() {
  if (run('adb', ['version']).ok) return 'adb';
  const candidate = getAdbCandidates(process.env, os.homedir()).find(({ adb }) => fs.existsSync(adb));
  return candidate?.adb ?? null;
}

function openAndroidDevices(devClientUrl) {
  const adb = findAdb();
  if (!adb) {
    warn('Android: adb not found (PATH, ANDROID_HOME, ANDROID_SDK_ROOT, ~/Library/Android/sdk).');
    return;
  }
  const devices = run(adb, ['devices']);
  if (!devices.ok) {
    warn(`Android: adb failed. ${devices.stderr.trim()}`);
    return;
  }
  const serials = parseAdbDevices(devices.stdout);
  if (serials.length === 0) {
    warn('Android: no emulator or device online. Start one from Android Studio, then press a in Metro or rerun npm run dev.');
    return;
  }
  for (const serial of serials) {
    if (!run(adb, ['-s', serial, 'shell', 'pm', 'path', DEV_APPLICATION_ID]).ok) {
      warn(
        `Android "${serial}": BeautIzzy Dev (${DEV_APPLICATION_ID}) is not installed. ` +
          `Build it once with APP_VARIANT=${APP_VARIANT} npx expo run:android.`,
      );
      continue;
    }
    const open = run(adb, [
      '-s',
      serial,
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      `'${devClientUrl}'`,
      DEV_APPLICATION_ID,
    ]);
    if (open.ok && !/Error/.test(open.stdout)) {
      log(`Android "${serial}": opened BeautIzzy Dev.`);
    } else {
      warn(`Android "${serial}": could not open BeautIzzy Dev. ${(open.stderr || open.stdout).trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function readProjectSlug() {
  const { expo } = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'app.json'), 'utf8'));
  return expo.slug;
}

async function openDevices(scheme) {
  const lanAddress = await resolveLanAddress();
  const lanServesMetro = lanAddress ? await isMetroRunning(lanAddress) : false;
  if (lanServesMetro) {
    log(`Metro is reachable on the LAN at http://${lanAddress}:${METRO_PORT} (scan the QR code above on the iPhone).`);
  } else if (lanAddress) {
    warn(`Metro does not answer on ${lanAddress}:${METRO_PORT}: the simulators use the loopback address.`);
  } else {
    warn('No LAN address: the simulators use the loopback address and the physical iPhone cannot connect.');
  }
  const host = lanServesMetro ? lanAddress : '127.0.0.1';
  openIosSimulators(buildDevClientUrl(scheme, host, METRO_PORT));
  openAndroidDevices(
    buildDevClientUrl(scheme, lanServesMetro ? host : ANDROID_EMULATOR_HOST_LOOPBACK, METRO_PORT),
  );
}

async function main() {
  const slug = readProjectSlug();
  const scheme = getDevClientScheme(slug);

  if (!(await isPortFree(METRO_PORT))) {
    if (!(await isMetroRunning('127.0.0.1'))) {
      warn(`Port ${METRO_PORT} is in use by something that is not Metro. Free it, then rerun npm run dev.`);
      process.exit(1);
    }
    const verdict = describeMetroManifest(await fetchMetroManifest('127.0.0.1'), slug);
    if (!verdict.compatible) {
      warn(`A Metro server is already running on port ${METRO_PORT}, but ${verdict.reason}.`);
      warn('Stop it (Ctrl+C in its terminal), then rerun npm run dev.');
      process.exit(1);
    }
    log(`Reusing the Metro server already running on port ${METRO_PORT} (${verdict.name}). Its QR code stays in its own terminal.`);
    await openDevices(scheme);
    return;
  }

  log(`Starting Metro (APP_VARIANT=${APP_VARIANT}, LAN, IPv4 first) on port ${METRO_PORT}…`);
  const metro = startMetro();
  // Ctrl+C reaches Metro through the terminal; forward the signal for the other cases
  // (Expo's exit hooks run once whatever the number of signals) and leave with Metro.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => metro.kill(signal));
  }
  metro.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

  if (!(await waitForMetro(metro))) {
    if (metro.exitCode === null) {
      warn(`Metro did not answer within ${METRO_READY_TIMEOUT_MS / 1000}s; devices were not opened. Use Metro's own shortcuts.`);
    }
    return;
  }
  await openDevices(scheme);
}

module.exports = {
  buildDevClientUrl,
  describeMetroManifest,
  getAdbCandidates,
  getDevClientScheme,
  parseAdbDevices,
  parseBootedSimulators,
};

if (require.main === module) {
  main().catch((error) => {
    warn(error?.stack ?? String(error));
    process.exit(1);
  });
}
