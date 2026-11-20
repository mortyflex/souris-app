import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicProfileView } from "@/components/booking/public-profile-view";
import { PublicFooter } from "@/components/layout/public-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { isBookingFlowEnabled } from "@/features/booking/flow-gate";
import { getLocationView } from "@/features/location/get-location-view";
import { getPublicProfile } from "@/features/public-profile/get-public-profile";
import { publicMediaUrl } from "@/features/public-profile/public-profile";
import { publicEnv } from "@/lib/env/public";

export async function generateMetadata({ params }: PageProps<"/r/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (profile === null) return { title: "Page introuvable" };
  return {
    title: profile.name,
    ...(profile.description ? { description: profile.description.slice(0, 160) } : {}),
  };
}

/**
 * Public profile of a professional. Rendered on every request, with no
 * Suspense boundary above the lookup: an address with no page online answers
 * a real HTTP 404 — unknown, malformed, draft or unpublished alike.
 */
export default async function PublicProfilePage({ params }: PageProps<"/r/[slug]">) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (profile === null) notFound();
  // The location as the server published it, for this visitor: directions, and the map when one can be signed.
  const location = await getLocationView(profile.location);

  return (
    <>
      <SiteHeader variant="profile" />
      <main className="flex-1 pb-16 pt-5 sm:pt-8 lg:pb-24">
        <PublicProfileView
          profile={profile}
          logoUrl={profile.logoPath ? publicMediaUrl(publicEnv.supabaseUrl, profile.logoPath) : undefined}
          coverUrl={profile.coverPath ? publicMediaUrl(publicEnv.supabaseUrl, profile.coverPath) : undefined}
          location={location}
          bookingOpen={isBookingFlowEnabled()}
        />
      </main>
      <PublicFooter variant="profile" />
    </>
  );
}
