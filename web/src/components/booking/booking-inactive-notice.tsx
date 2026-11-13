import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isValidProfileSlug } from "@/features/public-profile/slug";

/**
 * What both booking routes show while online booking is not built. It reads
 * the slug only to refuse a malformed address; it never suggests that a
 * professional, a service or a time slot exists behind it.
 */
async function BookingInactiveNotice({
  params,
  title,
}: {
  params: Promise<{ slug: string }>;
  title: string;
}) {
  const { slug } = await params;
  if (!isValidProfileSlug(slug)) notFound();

  return (
    <div className="flex flex-col items-start gap-5 rounded-[2rem] bg-lavender-50 p-8 sm:p-12">
      <Badge>Pas encore disponible</Badge>
      <h1 className="font-serif text-4xl leading-tight tracking-tight text-balance sm:text-5xl">
        {title}
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-foreground/75">
        La réservation en ligne BeautIzzy est en préparation. Aucune prise de rendez-vous
        n&apos;est possible depuis cette page pour le moment : contactez directement votre
        professionnelle.
      </p>
      <Button asChild variant="secondary">
        <Link href="/">Découvrir BeautIzzy</Link>
      </Button>
    </div>
  );
}

function BookingNoticeFallback() {
  return (
    <div
      role="status"
      aria-label="Chargement"
      className="h-72 animate-pulse rounded-[2rem] bg-lavender-50 motion-reduce:animate-none"
    />
  );
}

export { BookingInactiveNotice, BookingNoticeFallback };
