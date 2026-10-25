// BeautIzzy — Plus entitlement mirror: webhook authentication — pure
//
// Two independent checks, both applied BEFORE the body is parsed:
//
//   authorization   RevenueCat sends, verbatim, the Authorization header
//                   value configured in its dashboard. The function holds the
//                   same value as a server-side secret and compares it in
//                   constant time. Required: a deployment without it refuses
//                   every request.
//   signature       RevenueCat's opt-in HMAC signing: the header
//                   `X-RevenueCat-Webhook-Signature: t=<unix seconds>,v1=<hex>`
//                   where v1 = HMAC-SHA256(secret, `${t}.${raw body}`), the
//                   raw bytes exactly as received. Verified when the signing
//                   secret is configured; a timestamp outside the tolerance
//                   (five minutes) is refused as a replay. Several `v1=`
//                   values (a secret rotation) are all tried.
//
// Secret values are never part of a result or a message.

export const REVENUECAT_SIGNATURE_HEADER = 'X-RevenueCat-Webhook-Signature';

export const SIGNATURE_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

/** Constant-time equality of two strings' UTF-8 bytes (the comparison runs over the longer length). */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const length = Math.max(bytesA.length, bytesB.length);
  let difference = bytesA.length ^ bytesB.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (bytesA[index] ?? 0) ^ (bytesB[index] ?? 0);
  }
  return difference === 0;
}

/** Whether the request carries EXACTLY the configured Authorization value. */
export function isAuthorizedRequest(authorizationHeader: string | null, expected: string): boolean {
  if (authorizationHeader === null || expected.length === 0) return false;
  return timingSafeEqualStrings(authorizationHeader.trim(), expected);
}

export interface ParsedSignatureHeader {
  readonly timestampSeconds: number;
  readonly signatures: readonly string[];
}

/** `t=<seconds>,v1=<hex>[,v1=<hex>…]`; undefined for anything else. */
export function parseSignatureHeader(value: string | null): ParsedSignatureHeader | undefined {
  if (value === null) return undefined;
  let timestampSeconds: number | undefined;
  const signatures: string[] = [];
  for (const part of value.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) return undefined;
    const key = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    if (key === 't') {
      if (!/^\d{1,16}$/.test(raw)) return undefined;
      timestampSeconds = Number(raw);
    } else if (key === 'v1') {
      if (!/^[0-9a-fA-F]{64}$/.test(raw)) return undefined;
      signatures.push(raw.toLowerCase());
    }
    // Unknown schemes are ignored, as a future `v2` would be.
  }
  if (timestampSeconds === undefined || signatures.length === 0) return undefined;
  return { timestampSeconds, signatures };
}

export type HmacSha256Hex = (secret: string, message: string) => Promise<string>;

/** HMAC-SHA256 over UTF-8, hex-encoded, with the platform's Web Crypto (Deno and Node alike). */
export const webCryptoHmacSha256Hex: HmacSha256Hex = async (secret, message) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export type SignatureVerification = 'valid' | 'missing' | 'malformed' | 'expired' | 'mismatch';

export interface VerifySignatureInput {
  readonly header: string | null;
  /** The body bytes exactly as received, as text; never a re-serialized object. */
  readonly rawBody: string;
  readonly secret: string;
  readonly nowMs: number;
  readonly toleranceSeconds?: number;
  readonly hmac?: HmacSha256Hex;
}

export async function verifyRevenueCatSignature({
  header,
  rawBody,
  secret,
  nowMs,
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
  hmac = webCryptoHmacSha256Hex,
}: VerifySignatureInput): Promise<SignatureVerification> {
  if (header === null) return 'missing';
  const parsed = parseSignatureHeader(header);
  if (parsed === undefined) return 'malformed';
  const ageSeconds = Math.abs(nowMs / 1000 - parsed.timestampSeconds);
  if (ageSeconds > toleranceSeconds) return 'expired';
  const expected = await hmac(secret, `${parsed.timestampSeconds}.${rawBody}`);
  // Every candidate is compared so the timing does not reveal which one matched.
  let matched = false;
  for (const candidate of parsed.signatures) {
    if (timingSafeEqualStrings(candidate, expected)) matched = true;
  }
  return matched ? 'valid' : 'mismatch';
}
