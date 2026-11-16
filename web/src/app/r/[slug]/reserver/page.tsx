import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AvailabilityLoading, AvailabilityPreview } from "@/components/booking/availability-preview";
import { BookingFlow } from "@/components/booking/booking-flow";
import { BookingInactiveNotice } from "@/components/booking/booking-inactive-notice";
import { Button } from "@/components/ui/button";
import { parseAvailabilityQuery, type Availability } from "@/features/availability/availability";
import { getAvailability } from "@/features/availability/get-availability";
import { isAvailabilityPreviewEnabled } from "@/features/availability/preview";
import { isBookingFlowEnabled } from "@/features/booking/flow-gate";
import { getPublicProfile } from "@/features/public-profile/get-public-profile";
import type { PublicProfile } from "@/features/public-profile/public-profile";
import { bookingPath, profilePath } from "@/features/public-profile/slug";

export const metadata: Metadata = {
  title: "Réserver",
};

function BookingLoadError({ profile }: { profile: PublicProfile }) {
  return (
    <div className="flex flex-col items-start gap-5">
      <h1 className="type-headline">Prendre rendez-vous</h1>
      <div role="alert" className="flex flex-col gap-1 rounded-[1.25rem] bg-danger-surface px-5 py-4 text-danger">
        <p className="type-subtitle">Les prestations n’ont pas pu être chargées.</p>
        <p className="type-body-small">Réessayez dans un instant.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={bookingPath(profile.slug)}>Réessayer</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={profilePath(profile.slug)}>Retour à la page de {profile.name}</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The booking flow, where this deployment offers it (`isBookingFlowEnabled`:
 * development and Staging only for now). The profile and the bookable
 * services are read on the server before anything is sent, so an address
 * with no page online answers a real HTTP 404 and a page that does not accept
 * bookings says so. Everything after that — times, booking — goes through the
 * website's own endpoints (/api/booking/<slug>), never to Supabase.
 *
 * Elsewhere the route keeps its notice, or the read-only availability preview
 * (`isAvailabilityPreviewEnabled`).
 */
export default async function BookingPage({ params, searchParams }: PageProps<"/r/[slug]/reserver">) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (profile === null) notFound();

  if (isBookingFlowEnabled()) {
    if (!profile.bookingEnabled) return <BookingInactiveNotice profile={profile} reason="paused" />;
    let availability: Availability | null;
    try {
      availability = await getAvailability(profile.slug, {});
    } catch {
      return <BookingLoadError profile={profile} />;
    }
    if (availability === null) return <BookingInactiveNotice profile={profile} reason="unavailable" />;
    return (
      <BookingFlow
        slug={profile.slug}
        profileHref={profilePath(profile.slug)}
        professional={{
          name: profile.name,
          ...(profile.address !== undefined ? { address: profile.address } : {}),
          ...(profile.phone !== undefined ? { phone: profile.phone } : {}),
          ...(profile.email !== undefined ? { email: profile.email } : {}),
        }}
        initial={{
          services: availability.services,
          firstDate: availability.firstDate,
          lastDate: availability.lastDate,
          timeZone: availability.timeZone,
        }}
      />
    );
  }

  if (!isAvailabilityPreviewEnabled()) return <BookingInactiveNotice profile={profile} />;

  const query = parseAvailabilityQuery(await searchParams);
  return (
    <Suspense key={`${query.serviceId ?? ""}|${query.date ?? ""}`} fallback={<AvailabilityLoading />}>
      <AvailabilityPreview profile={profile} query={query} />
    </Suspense>
  );
}
