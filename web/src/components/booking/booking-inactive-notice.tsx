import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicProfile } from "@/features/public-profile/public-profile";
import { profilePath } from "@/features/public-profile/slug";

/**
 * What the booking route shows while online booking is not built: no service,
 * no time slot, no form — only that it is not possible yet, and the way back
 * to the professional's page.
 */
function BookingInactiveNotice({ profile }: { profile: Pick<PublicProfile, "slug" | "name"> }) {
  return (
    <div className="flex flex-col items-start gap-5 rounded-[2rem] bg-lavender-50 p-8 sm:p-12">
      <Badge>Pas encore disponible</Badge>
      <h1 className="type-headline">
        La prise de rendez-vous en ligne n&apos;est pas encore ouverte.
      </h1>
      <p className="type-lead max-w-xl text-foreground/75">
        La réservation en ligne BeautIzzy est en préparation. Aucune prise de rendez-vous
        n&apos;est possible depuis cette page pour le moment.
      </p>
      <Button asChild variant="secondary">
        <Link href={profilePath(profile.slug)}>Retour à la page de {profile.name}</Link>
      </Button>
    </div>
  );
}

export { BookingInactiveNotice };
