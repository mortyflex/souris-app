import type { Metadata } from "next";
import { Suspense } from "react";

import {
  BookingInactiveNotice,
  BookingNoticeFallback,
} from "@/components/booking/booking-inactive-notice";

export const metadata: Metadata = {
  title: "Page de réservation",
};

/** Future public profile of a professional. Not active yet: it only renders the inactive notice. */
export default function PublicProfilePage({ params }: PageProps<"/r/[slug]">) {
  return (
    <Suspense fallback={<BookingNoticeFallback />}>
      <BookingInactiveNotice params={params} title="Cette page de réservation n'est pas encore ouverte." />
    </Suspense>
  );
}
