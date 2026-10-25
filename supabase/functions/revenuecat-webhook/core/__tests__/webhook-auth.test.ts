import {
  isAuthorizedRequest,
  parseSignatureHeader,
  timingSafeEqualStrings,
  verifyRevenueCatSignature,
  webCryptoHmacSha256Hex,
} from '../webhook-auth';

const SECRET = 'whsec_test_signing_secret_value';
const NOW_MS = Date.UTC(2026, 9, 1, 10, 0, 0);

async function signedHeader(body: string, secret = SECRET, timestampSeconds = Math.floor(NOW_MS / 1000)): Promise<string> {
  const signature = await webCryptoHmacSha256Hex(secret, `${timestampSeconds}.${body}`);
  return `t=${timestampSeconds},v1=${signature}`;
}

describe('webhook authorization', () => {
  it('accepts the exact configured value only', () => {
    expect(isAuthorizedRequest('Bearer abc-123', 'Bearer abc-123')).toBe(true);
    expect(isAuthorizedRequest('  Bearer abc-123 ', 'Bearer abc-123')).toBe(true);
    expect(isAuthorizedRequest('Bearer abc-124', 'Bearer abc-123')).toBe(false);
    expect(isAuthorizedRequest('Bearer abc-12', 'Bearer abc-123')).toBe(false);
    expect(isAuthorizedRequest('', 'Bearer abc-123')).toBe(false);
    expect(isAuthorizedRequest(null, 'Bearer abc-123')).toBe(false);
  });

  it('never authorizes against an empty configured value', () => {
    expect(isAuthorizedRequest('', '')).toBe(false);
  });

  it('compares bytes, not prefixes, whatever the lengths', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualStrings('abcd', 'abc')).toBe(false);
    expect(timingSafeEqualStrings('', '')).toBe(true);
    expect(timingSafeEqualStrings('é', 'e')).toBe(false);
  });
});

describe('RevenueCat signature header', () => {
  it('parses t and v1, lowercases the hex, ignores unknown schemes', () => {
    const hex = 'A'.repeat(64);
    expect(parseSignatureHeader(`t=1700000000,v1=${hex},v2=future`)).toEqual({
      timestampSeconds: 1700000000,
      signatures: [hex.toLowerCase()],
    });
  });

  it('accepts several v1 values (a rotation)', () => {
    const a = '1'.repeat(64);
    const b = '2'.repeat(64);
    expect(parseSignatureHeader(`t=1,v1=${a},v1=${b}`)?.signatures).toEqual([a, b]);
  });

  it.each([
    [null],
    [''],
    ['t=abc,v1=' + '0'.repeat(64)],
    ['v1=' + '0'.repeat(64)],
    ['t=1'],
    ['t=1,v1=zz'],
    ['t=1,v1=' + '0'.repeat(63)],
    ['garbage'],
  ])('refuses a malformed header %p', (header) => {
    expect(parseSignatureHeader(header)).toBeUndefined();
  });
});

describe('RevenueCat signature verification', () => {
  const body = '{"api_version":"1.0","event":{"type":"TEST","id":"1"}}';

  it('accepts a signature over `<t>.<raw body>` within the tolerance', async () => {
    const header = await signedHeader(body);
    await expect(verifyRevenueCatSignature({ header, rawBody: body, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('valid');
    await expect(verifyRevenueCatSignature({ header, rawBody: body, secret: SECRET, nowMs: NOW_MS + 299_000 })).resolves.toBe('valid');
  });

  it('refuses a re-serialized body: the raw bytes must match', async () => {
    const header = await signedHeader(body);
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    await expect(verifyRevenueCatSignature({ header, rawBody: reserialized, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('mismatch');
  });

  it('refuses another secret', async () => {
    const header = await signedHeader(body, 'another-secret');
    await expect(verifyRevenueCatSignature({ header, rawBody: body, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('mismatch');
  });

  it('refuses a replay outside the tolerance, in both directions', async () => {
    const old = await signedHeader(body, SECRET, Math.floor(NOW_MS / 1000) - 301);
    await expect(verifyRevenueCatSignature({ header: old, rawBody: body, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('expired');
    const future = await signedHeader(body, SECRET, Math.floor(NOW_MS / 1000) + 301);
    await expect(verifyRevenueCatSignature({ header: future, rawBody: body, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('expired');
  });

  it('reports a missing or malformed header', async () => {
    await expect(verifyRevenueCatSignature({ header: null, rawBody: body, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('missing');
    await expect(verifyRevenueCatSignature({ header: 't=1', rawBody: body, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('malformed');
  });

  it('accepts when any of several v1 values matches', async () => {
    const t = Math.floor(NOW_MS / 1000);
    const good = await webCryptoHmacSha256Hex(SECRET, `${t}.${body}`);
    const header = `t=${t},v1=${'0'.repeat(64)},v1=${good}`;
    await expect(verifyRevenueCatSignature({ header, rawBody: body, secret: SECRET, nowMs: NOW_MS })).resolves.toBe('valid');
  });

  it('computes a standard HMAC-SHA256 (RFC 4231 test case 2)', async () => {
    await expect(webCryptoHmacSha256Hex('Jefe', 'what do ya want for nothing?')).resolves.toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });
});
