import "server-only";

import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";

/** The booking functions the website may call (all granted to service_role only). */
export type BookingRpc =
  | "online_booking_create_booking"
  | "online_booking_take_request_quota"
  // supabase/migrations/20261022120000_add_online_booking_multi_service.sql
  | "online_booking_public_selection_availability"
  | "online_booking_create_selection_booking";

export type RpcResult =
  | { readonly ok: true; readonly data: unknown }
  /**
   * The call failed. `status` is the HTTP status when the server answered;
   * absent for a network failure or a timeout — whether the function ran is
   * then UNKNOWN.
   */
  | {
      readonly ok: false;
      readonly status?: number;
      /**
       * The error code PostgREST answered with, when it gave one: a SQLSTATE
       * (`40001`…) or its own (`PGRST202`: no such function — the migration
       * is not applied). Nothing else of the body is ever read.
       */
      readonly code?: string;
    };

/** PostgREST's code for "no function of that name and arguments": the migration that defines it is not applied. */
export const MISSING_FUNCTION = "PGRST202";
/** SQLSTATE serialization_failure: the transaction was rolled back — nothing was written. */
export const SERIALIZATION_FAILURE = "40001";

const ERROR_CODE = /^(PGRST\d{3}|[0-9A-Z]{5})$/;

/** The `code` of a PostgREST error body, shape-checked — never its message, details or hint. */
async function errorCodeOf(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
    return typeof code === "string" && ERROR_CODE.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Calls ONE booking function over PostgREST with the secret key, uncached,
 * with a timeout. Never throws: configuration, network and server failures
 * are all a failed result. The key, the URL and the response body never
 * leave this module — not in an error, not in a log.
 */
export async function callBookingRpc(name: BookingRpc, body: Record<string, unknown>, timeoutMs: number): Promise<RpcResult> {
  let url: string;
  let secretKey: string;
  try {
    const supabaseUrl = publicEnv.supabaseUrl;
    if (!supabaseUrl) return { ok: false };
    secretKey = serverEnv.supabaseSecretKey();
    url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${name}`;
  } catch {
    return { ok: false };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false };
  }
  if (!response.ok) {
    const code = await errorCodeOf(response);
    return { ok: false, status: response.status, ...(code !== undefined ? { code } : {}) };
  }
  try {
    return { ok: true, data: await response.json() };
  } catch {
    // A 2xx whose body cannot be read: the function ran, its answer is unknown.
    return { ok: false, status: response.status };
  }
}
