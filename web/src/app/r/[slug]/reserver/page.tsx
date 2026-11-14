import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookingInactiveNotice } from "@/components/booking/booking-inactive-notice";
import { getPublicProfile } from "@/features/public-profile/get-public-profile";

export const metadata: Metadata = {
  title: "Réserver",
};

/**
 * Future booking flow. Not built yet: for a professional whose page is online
 * it only says so; for any other address it answers a real HTTP 404.
 */
export default async function BookingPage({ params }: PageProps<"/r/[slug]/reserver">) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (profile === null) notFound();

  return <BookingInactiveNotice profile={profile} />;
}
