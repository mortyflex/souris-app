import "server-only";

import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";

/** The two booking functions the website may call (both granted to service_role only). */
export type BookingRpc = "online_booking_create_booking" | "online_booking_take_request_quota";

export type RpcResult =
  | { readonly ok: true; readonly data: unknown }
  /**
   * The call failed. `status` is the HTTP status when the server answered;
   * absent for a network failure or a timeout — whether the function ran is
   * then UNKNOWN.
   */
  | { readonly ok: false; readonly status?: number };

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
  if (!response.ok) return { ok: false, status: response.status };
  try {
    return { ok: true, data: await response.json() };
  } catch {
    // A 2xx whose body cannot be read: the function ran, its answer is unknown.
    return { ok: false, status: response.status };
  }
}
