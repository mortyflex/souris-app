import "server-only";

import { cache } from "react";

import { publicEnv } from "@/lib/env/public";
import { MissingServerEnvError, serverEnv } from "@/lib/env/server";

import { parsePublicProfile, type PublicProfile } from "./public-profile";
import { isValidProfileSlug } from "./slug";

export class PublicProfileUnavailableError extends Error {
  constructor(detail: string) {
    // Never the key, the URL or the response body: a status or a short reason only.
    super(`Public profile lookup failed: ${detail}`);
    this.name = "PublicProfileUnavailableError";
  }
}

/**
 * The profile online behind a slug, or `null` when there is none — unknown,
 * malformed, draft, unpublished, or offline for lack of a verified
 * subscription: the server answers the same `null` for all of them, and so
 * does this function. A malformed slug never reaches the database.
 *
 * Server-only: it calls the ONE public-read function of the database with the
 * secret key, which never leaves this module. The browser never talks to
 * Supabase. Not cached: an edit made in the mobile application shows on the
 * next request. `cache()` only shares one lookup between the metadata and the
 * page of a single request.
 *
 * Throws when the lookup itself fails (configuration, network, server error):
 * a failure is never shown as "this page does not exist".
 */
export const getPublicProfile = cache(async (slug: string): Promise<PublicProfile | null> => {
  if (!isValidProfileSlug(slug)) return null;

  const supabaseUrl = publicEnv.supabaseUrl;
  if (!supabaseUrl) throw new MissingServerEnvError("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = serverEnv.supabaseSecretKey();

  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/online_booking_public_profile`,
      {
        method: "POST",
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_slug: slug }),
        cache: "no-store",
      },
    );
  } catch {
    throw new PublicProfileUnavailableError("network");
  }
  if (!response.ok) throw new PublicProfileUnavailableError(`HTTP ${response.status}`);

  const profile = parsePublicProfile(await response.json());
  // The server matched this slug; anything else is not the page that was asked for.
  return profile !== null && profile.slug === slug ? profile : null;
});
