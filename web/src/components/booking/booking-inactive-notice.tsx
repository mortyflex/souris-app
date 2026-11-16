import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicProfile } from "@/features/public-profile/public-profile";
import { profilePath } from "@/features/public-profile/slug";

export type BookingNoticeReason =
  /** This deployment offers no booking flow (the default everywhere but development / Staging). */
  | "not-open"
  /** The professional paused online bookings. */
  | "paused"
  /** Bookings cannot be taken right now (the server answered that nothing can be booked here). */
  | "unavailable";

const COPY: Readonly<Record<BookingNoticeReason, { badge: string; title: string; body: string }>> = {
  "not-open": {
    badge: "Pas encore disponible",
    title: "La prise de rendez-vous en ligne n'est pas encore ouverte.",
    body: "La réservation en ligne BeautIzzy est en préparation. Aucune prise de rendez-vous n'est possible depuis cette page pour le moment.",
  },
  paused: {
    badge: "En pause",
    title: "Les réservations en ligne sont en pause.",
    body: "Cette professionnelle ne prend pas de rendez-vous en ligne pour le moment. Vous pouvez la contacter directement.",
  },
  unavailable: {
    badge: "Indisponible",
    title: "La réservation en ligne n'est pas disponible pour le moment.",
    body: "Aucun rendez-vous ne peut être pris depuis cette page en ce moment. Vous pouvez contacter cette professionnelle directement.",
  },
};

/**
 * What the booking route shows when nothing can be booked from it: no
 * service, no time slot, no form — only why, and the way back to the
 * professional's page.
 */
function BookingInactiveNotice({
  profile,
  reason = "not-open",
}: {
  profile: Pick<PublicProfile, "slug" | "name">;
  reason?: BookingNoticeReason;
}) {
  const copy = COPY[reason];
  return (
    <div className="flex flex-col items-start gap-5 rounded-[2rem] bg-lavender-50 p-8 sm:p-12">
      <Badge variant={reason === "not-open" ? "lavender" : "neutral"}>{copy.badge}</Badge>
      <h1 className="type-headline">{copy.title}</h1>
      <p className="type-lead max-w-xl text-foreground/75">{copy.body}</p>
      <Button asChild variant="secondary">
        <Link href={profilePath(profile.slug)}>Retour à la page de {profile.name}</Link>
      </Button>
    </div>
  );
}

export { BookingInactiveNotice };
