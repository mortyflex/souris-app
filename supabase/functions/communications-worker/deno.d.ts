// Souris — Communication Core: ambient types for the Deno Edge Function entry
//
// index.ts runs on Supabase Edge Functions (Deno) and imports the server SDK
// through a Deno npm specifier the app's TypeScript project cannot resolve.
// This is the minimal structural surface the entry actually uses; the SDK's
// real types apply at deploy time.

/**
 * The one Deno global the entry uses: Edge Function secrets
 * (RESEND_API_KEY, RESEND_FROM_EMAIL). Type-only; the runtime provides it.
 */
declare const Deno: {
  readonly env: { get(name: string): string | undefined };
};

declare module 'npm:@supabase/server' {
  export interface SupabaseServerContext {
    /** Privileged server client (service_role): the RPC slice the worker needs. */
    readonly supabaseAdmin: {
      rpc(
        fn: string,
        args?: Record<string, unknown>,
      ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    /** Which configured auth mode matched (e.g. 'secret'). */
    readonly authMode: string;
  }

  /**
   * Wraps a handler with Supabase credential validation. `auth` names the
   * accepted modes ('user', 'secret', 'publishable', 'none', or a named key
   * such as 'secret:communications_worker'); anything else is refused with a
   * 401 before the handler runs.
   */
  export function withSupabase(
    options: { auth: string | readonly string[] },
    handler: (
      request: Request,
      ctx: SupabaseServerContext,
    ) => Response | Promise<Response>,
  ): (request: Request) => Promise<Response>;
}
