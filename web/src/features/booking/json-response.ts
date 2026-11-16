import "server-only";

/**
 * A JSON answer of the booking endpoints: never cached by a browser, a CDN
 * or Next.js — an availability or a booking answer is only ever a snapshot.
 */
export function noStoreJson(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
