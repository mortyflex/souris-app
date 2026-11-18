import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AvailabilityLoading, AvailabilityPreview } from "@/components/booking/availability-preview";
import { BookingFlow } from "@/components/booking/booking-flow";
import { BookingInactiveNotice } from "@/components/booking/booking-inactive-notice";
import { PublicFooter } from "@/components/layout/public-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { LinkPendingGlyph } from "@/components/motion/link-pending-glyph";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { parseAvailabilityQuery } from "@/features/availability/availability";
import { isAvailabilityPreviewEnabled } from "@/features/availability/preview";
import { getBookingCatalog, type BookingCatalog } from "@/features/booking/booking-catalog";
import { isBookingFlowEnabled } from "@/features/booking/flow-gate";
import { challengeSiteKey } from "@/features/booking/turnstile";
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
          <Link href={bookingPath(profile.slug)}>
            Réessayer
            <LinkPendingGlyph />
          </Link>
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
 * Without a usable bot challenge (Cloudflare Turnstile keys, `turnstile.ts`)
 * the flow is not offered: the page says booking is unavailable (fail closed).
 *
 * Which booking the flow offers is the database's answer (`getBookingCatalog`):
 * several services in ONE appointment where the multi-service contract is
 * applied, the single-service flow where it is not yet — never a guess from a
 * failure.
 *
 * Elsewhere the route keeps its notice, or the read-only availability preview
 * (`isAvailabilityPreviewEnabled`).
 */
export default async function BookingPage(props: PageProps<"/r/[slug]/reserver">) {
  // Resolved BEFORE anything renders: an address with no page online still answers a real 404.
  const { content, wide } = await bookingContent(props);
  return (
    <>
      <SiteHeader variant="flow" />
      <main className="flex-1 bg-[linear-gradient(180deg,var(--bz-lavender-25)_0,#fff_460px)] py-8 sm:py-12 lg:py-14">
        {/* The flow (steps beside their summary) is wide; a notice keeps a reading width. */}
        <Container className={wide ? undefined : "max-w-3xl"}>{content}</Container>
      </main>
      <PublicFooter variant="flow" />
    </>
  );
}

interface BookingContent {
  readonly content: ReactNode;
  readonly wide: boolean;
}

async function bookingContent({ params, searchParams }: PageProps<"/r/[slug]/reserver">): Promise<BookingContent> {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (profile === null) notFound();

  if (isBookingFlowEnabled()) {
    if (!profile.bookingEnabled) return { content: <BookingInactiveNotice profile={profile} reason="paused" />, wide: false };
    const siteKey = challengeSiteKey();
    if (siteKey === undefined) return { content: <BookingInactiveNotice profile={profile} reason="unavailable" />, wide: false };
    let catalog: BookingCatalog | null;
    try {
      catalog = await getBookingCatalog(profile.slug);
    } catch {
      return { content: <BookingLoadError profile={profile} />, wide: false };
    }
    if (catalog === null) return { content: <BookingInactiveNotice profile={profile} reason="unavailable" />, wide: false };
    return {
      wide: true,
      content: (
        <BookingFlow
          slug={profile.slug}
          profileHref={profilePath(profile.slug)}
          challengeSiteKey={siteKey}
          professional={{
            name: profile.name,
            ...(profile.address !== undefined ? { address: profile.address } : {}),
            ...(profile.phone !== undefined ? { phone: profile.phone } : {}),
            ...(profile.email !== undefined ? { email: profile.email } : {}),
          }}
          initial={{
            mode: catalog.mode,
            services: catalog.services,
            firstDate: catalog.firstDate,
            lastDate: catalog.lastDate,
            timeZone: catalog.timeZone,
          }}
        />
      ),
    };
  }

  if (!isAvailabilityPreviewEnabled()) return { content: <BookingInactiveNotice profile={profile} />, wide: false };

  const query = parseAvailabilityQuery(await searchParams);
  return {
    wide: false,
    content: (
      <Suspense key={`${query.serviceId ?? ""}|${query.date ?? ""}`} fallback={<AvailabilityLoading />}>
        <AvailabilityPreview profile={profile} query={query} />
      </Suspense>
    ),
  };
}
