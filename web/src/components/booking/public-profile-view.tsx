import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PublicProfile } from "@/features/public-profile/public-profile";

interface PublicProfileViewProps {
  profile: PublicProfile;
  /** Public URLs of the branding images; absent when the professional has none. */
  logoUrl?: string;
  coverUrl?: string;
}

// Instrument Serif carries the identity and the section headlines; Plus Jakarta
// Sans carries everything that is read or acted on.
const sectionTitle = "font-serif text-[1.75rem] leading-[1.15] text-balance sm:text-[2rem]";
const sectionBody = "max-w-[58ch] text-base leading-7 text-foreground/80";
const detailLabel = "text-xs font-semibold tracking-[0.08em] text-foreground/65 uppercase";
const detailLink =
  "font-medium text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700";

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
    <article className="flex flex-col gap-10 sm:gap-12">
      {/*
        One composition: the cover is the ground, and the identity panel —
        logo, name, presentation — rests on its lower edge. Without a cover
        the same panel rests on a shorter brand-tinted band.
      */}
      <header>
        <div
          className={cn(
            "relative overflow-hidden rounded-[1.75rem] bg-lavender-100 sm:rounded-[2rem]",
            coverUrl ? "aspect-[16/10] sm:aspect-[16/7]" : "h-36 sm:h-48",
          )}
        >
          {coverUrl ? (
            <>
              {/*
                A remote image of a fixed, already-optimized size (≤ 1600 px, set by
                the mobile application): the Next.js image optimizer is not needed.
                Always cropped from its centre, whatever its proportions.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverUrl}
                alt=""
                className="h-full w-full object-cover object-center"
                decoding="async"
                fetchPriority="high"
              />
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-foreground/25 to-transparent"
              />
            </>
          ) : (
            <div
              aria-hidden="true"
              className="h-full w-full bg-gradient-to-br from-lavender-50 via-lavender-100 to-lavender-200"
            />
          )}
        </div>

        <div className="relative mx-3 -mt-12 rounded-[1.5rem] bg-background px-5 pb-6 shadow-lifted ring-1 ring-border/60 sm:mx-8 sm:-mt-16 sm:rounded-[1.75rem] sm:px-9 sm:pb-9">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] bg-lavender-50 shadow-card ring-4 ring-background sm:-mt-12 sm:h-28 sm:w-28 sm:rounded-[1.5rem]">
              {logoUrl ? (
                // Shown whole, never stretched: a logo that is not square keeps its proportions.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-full w-full bg-background object-contain" decoding="async" />
              ) : (
                <span aria-hidden="true" className="font-serif text-[2.5rem] leading-none text-lavender-700 sm:text-[3.25rem]">
                  {initialOf(profile.name)}
                </span>
              )}
            </div>
            <h1 className="min-w-0 max-w-full break-words text-center font-serif text-[clamp(2rem,1.4rem+3vw,3.25rem)] leading-[1.06] tracking-[-0.01em] text-balance [overflow-wrap:anywhere] sm:pt-5 sm:text-left">
              {profile.name}
            </h1>
          </div>

          {profile.description ? (
            <p className="mx-auto mt-5 max-w-[62ch] border-t border-border/70 pt-5 text-center text-base leading-7 whitespace-pre-line break-words text-foreground/80 sm:mx-0 sm:mt-7 sm:pt-7 sm:text-left sm:text-[1.0625rem] sm:leading-[1.75]">
              {profile.description}
            </p>
          ) : null}
        </div>
      </header>

      <section
        aria-labelledby="booking-status"
        className="flex flex-col items-start gap-3 rounded-[1.75rem] bg-lavender-50 p-6 sm:rounded-[2rem] sm:p-9"
      >
        {profile.bookingEnabled ? (
          <>
            <Badge>Bientôt disponible</Badge>
            <h2 id="booking-status" className={sectionTitle}>
              La réservation en ligne arrive bientôt.
            </h2>
            <p className={sectionBody}>
              Il n&apos;est pas encore possible de prendre rendez-vous depuis cette page.
              {hasContact ? " En attendant, contactez directement votre professionnelle." : ""}
            </p>
          </>
        ) : (
          <>
            <Badge variant="neutral">En pause</Badge>
            <h2 id="booking-status" className={sectionTitle}>
              Les réservations en ligne sont en pause.
            </h2>
            <p className={sectionBody}>
              Cette professionnelle ne prend pas de rendez-vous en ligne pour le moment.
              {hasContact ? " Vous pouvez la contacter directement." : ""}
            </p>
          </>
        )}
      </section>

      {hasContact ? (
        <section aria-labelledby="contact" className="flex flex-col gap-5 px-1 sm:px-9">
          <h2 id="contact" className={sectionTitle}>
            Contact
          </h2>
          <dl className="grid gap-x-10 gap-y-5 border-t border-border/70 pt-5 sm:grid-cols-2">
            {profile.phone ? (
              <div className="flex flex-col gap-1.5">
                <dt className={detailLabel}>Téléphone</dt>
                <dd>
                  <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} className={detailLink}>
                    {profile.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {profile.email ? (
              <div className="flex min-w-0 flex-col gap-1.5">
                <dt className={detailLabel}>E-mail</dt>
                <dd className="break-words [overflow-wrap:anywhere]">
                  <a href={`mailto:${profile.email}`} className={detailLink}>
                    {profile.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {profile.address ? (
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <dt className={detailLabel}>Adresse</dt>
                <dd className="max-w-[48ch] break-words leading-7 whitespace-pre-line">{profile.address}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </article>
  );
}

export { PublicProfileView };
