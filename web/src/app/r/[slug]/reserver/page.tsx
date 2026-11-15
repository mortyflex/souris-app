import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AvailabilityLoading, AvailabilityPreview } from "@/components/booking/availability-preview";
import { BookingInactiveNotice } from "@/components/booking/booking-inactive-notice";
import { parseAvailabilityQuery } from "@/features/availability/availability";
import { isAvailabilityPreviewEnabled } from "@/features/availability/preview";
import { getPublicProfile } from "@/features/public-profile/get-public-profile";

export const metadata: Metadata = {
  title: "Réserver",
};

/**
 * Future booking flow. Not built yet: for a professional whose page is online
 * it only says so; for any other address it answers a real HTTP 404 — the
 * profile lookup completes before anything streams.
 *
 * Development and Staging may show a read-only availability preview instead
 * (`isAvailabilityPreviewEnabled`); only that part loads under Suspense, keyed
 * by the selection so each choice shows its own loading state.
 */
export default async function BookingPage({ params, searchParams }: PageProps<"/r/[slug]/reserver">) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (profile === null) notFound();

  if (!isAvailabilityPreviewEnabled()) return <BookingInactiveNotice profile={profile} />;

  const query = parseAvailabilityQuery(await searchParams);
  return (
    <Suspense key={`${query.serviceId ?? ""}|${query.date ?? ""}`} fallback={<AvailabilityLoading />}>
      <AvailabilityPreview profile={profile} query={query} />
    </Suspense>
  );
}
