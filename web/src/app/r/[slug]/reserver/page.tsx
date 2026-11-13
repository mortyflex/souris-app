import type { Metadata } from "next";
import { Suspense } from "react";

import {
  BookingInactiveNotice,
  BookingNoticeFallback,
} from "@/components/booking/booking-inactive-notice";

export const metadata: Metadata = {
  title: "Réserver",
};

/** Future booking flow. Not active yet: it only renders the inactive notice. */
export default function BookingPage({ params }: PageProps<"/r/[slug]/reserver">) {
  return (
    <Suspense fallback={<BookingNoticeFallback />}>
      <BookingInactiveNotice params={params} title="La prise de rendez-vous en ligne n'est pas encore ouverte." />
    </Suspense>
  );
}
