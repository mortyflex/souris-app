import { Badge } from "@/components/ui/badge";
import type { PublicProfile } from "@/features/public-profile/public-profile";

interface PublicProfileViewProps {
  profile: PublicProfile;
  /** Public URLs of the branding images; absent when the professional has none. */
  logoUrl?: string;
  coverUrl?: string;
}

function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? "").toUpperCase();
}

/**
 * The public page of a professional. It shows what she chose to publish and
 * nothing else: no service, no price, no time slot — the booking engine does
 * not exist yet, and the page says so instead of pretending.
 */
function PublicProfileView({ profile, logoUrl, coverUrl }: PublicProfileViewProps) {
  const hasContact = Boolean(profile.phone || profile.email || profile.address);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-5">
        <div className="aspect-[16/7] overflow-hidden rounded-[2rem] bg-lavender-100">
          {coverUrl ? (
            // A remote image of a fixed, already-optimized size (≤ 1600 px, set by
            // the mobile application): the Next.js image optimizer is not needed.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-full w-full bg-gradient-to-br from-lavender-50 via-lavender-100 to-lavender-200"
            />
          )}
        </div>

        <div className="flex items-center gap-4 sm:gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-lavender-100 sm:h-24 sm:w-24">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-cover" decoding="async" />
            ) : (
              <span aria-hidden="true" className="font-serif text-4xl text-lavender-700">
                {initialOf(profile.name)}
              </span>
            )}
          </div>
          <h1 className="min-w-0 font-serif text-4xl leading-tight tracking-tight text-balance break-words sm:text-5xl">
            {profile.name}
          </h1>
        </div>
      </header>

      {profile.description ? (
        <p className="max-w-2xl text-lg leading-relaxed whitespace-pre-line break-words text-foreground/80">
          {profile.description}
        </p>
      ) : null}

      <section
        aria-labelledby="booking-status"
        className="flex flex-col items-start gap-3 rounded-[2rem] bg-lavender-50 p-6 sm:p-8"
      >
        {profile.bookingEnabled ? (
          <>
            <Badge>Bientôt disponible</Badge>
            <h2 id="booking-status" className="font-serif text-2xl leading-snug sm:text-3xl">
              La réservation en ligne arrive bientôt.
            </h2>
            <p className="max-w-xl leading-relaxed text-foreground/75">
              Il n&apos;est pas encore possible de prendre rendez-vous depuis cette page.
              {hasContact ? " En attendant, contactez directement votre professionnelle." : ""}
            </p>
          </>
        ) : (
          <>
            <Badge variant="neutral">En pause</Badge>
            <h2 id="booking-status" className="font-serif text-2xl leading-snug sm:text-3xl">
              Les réservations en ligne sont en pause.
            </h2>
            <p className="max-w-xl leading-relaxed text-foreground/75">
              Cette professionnelle ne prend pas de rendez-vous en ligne pour le moment.
              {hasContact ? " Vous pouvez la contacter directement." : ""}
            </p>
          </>
        )}
      </section>

      {hasContact ? (
        <section aria-labelledby="contact" className="flex flex-col gap-4">
          <h2 id="contact" className="font-serif text-2xl">
            Contact
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {profile.phone ? (
              <div className="flex flex-col gap-1">
                <dt className="text-sm font-semibold text-foreground/60">Téléphone</dt>
                <dd>
                  <a
                    href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}
                    className="font-medium text-lavender-700 underline-offset-4 hover:underline"
                  >
                    {profile.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {profile.email ? (
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-sm font-semibold text-foreground/60">E-mail</dt>
                <dd className="break-words">
                  <a
                    href={`mailto:${profile.email}`}
                    className="font-medium text-lavender-700 underline-offset-4 hover:underline"
                  >
                    {profile.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {profile.address ? (
              <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                <dt className="text-sm font-semibold text-foreground/60">Adresse</dt>
                <dd className="break-words whitespace-pre-line">{profile.address}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </article>
  );
}

export { PublicProfileView };
