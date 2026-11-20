import Link from "next/link";

import { NacreCover } from "@/components/brand/nacre-cover";
import { LinkPendingGlyph } from "@/components/motion/link-pending-glyph";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CheckIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import { describeTimeZone } from "@/features/availability/availability";
import type { LocationView } from "@/features/location/location-view";
import type { PublicProfile } from "@/features/public-profile/public-profile";
import { bookingPath } from "@/features/public-profile/slug";
import { cn } from "@/lib/utils";

import { CoverPhoto } from "./cover-photo";
import { LocationRow } from "./location-card";
import { profileNameRole } from "./profile-name";

interface PublicProfileViewProps {
  profile: PublicProfile;
  /** Public URLs of the branding images; absent when the professional has none. */
  logoUrl?: string;
  coverUrl?: string;
  /**
   * What the page shows of her location (`getLocationView`): the published
   * address with its directions and its map, a city, or — absent — nothing.
   * Never read from the profile here: the level was applied by the server.
   */
  location?: LocationView;
  /**
   * Whether this deployment offers the booking flow (`isBookingFlowEnabled`).
   * With it, a page that accepts bookings invites to book; without it, the
   * page says booking is coming.
   */
  bookingOpen?: boolean;
}

const quietLink =
  "font-medium text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700";
const actionChip =
  "type-label inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-lavender-200 bg-lavender-25 px-4 text-lavender-700 transition-colors duration-[var(--bz-duration-state)] hover:border-lavender-200 hover:bg-lavender-50 max-lg:min-h-[66px] max-lg:flex-col max-lg:gap-1.5 max-lg:rounded-[1.1rem] max-lg:px-2 max-lg:text-[0.8125rem]";

function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? "").toUpperCase();
}

/**
 * The public page of a professional — the approved « Nacre » design. It shows
 * what the professional chose to publish and nothing else: no service, no price, no time
 * slot, no hidden detail.
 *
 *   - the cover: the professional’s photo, which always wins, or the animated Nacre artwork;
 *   - the identity card resting on the cover: logo (or monogram), name,
 *     quick contact actions for the PUBLISHED phone and e-mail only, the
 *     description;
 *   - the booking card: sticky beside the identity on desktop, a sticky
 *     action at the bottom of the screen on a phone that docks in place
 *     (CSS only); or why booking is not possible here;
 *   - contact and location: the published details; the location exactly as
 *     the professional chose to publish it (`LocationRow`) — a complete
 *     address with its directions and its map, a city alone, or nothing.
 */
function PublicProfileView({ profile, logoUrl, coverUrl, location, bookingOpen = false }: PublicProfileViewProps) {
  // A way to reach her: a phone, an e-mail, or an address to go to — a city alone is none.
  const hasContact = Boolean(profile.phone || profile.email || location?.kind === "address");
  const hasDetails = hasContact || location !== undefined;
  const canBook = profile.bookingEnabled && bookingOpen;

  return (
    <Container>
      <article className="flex flex-col">
        <div className="relative isolate aspect-[16/10] overflow-hidden rounded-[1.75rem] bg-lavender-100 sm:aspect-[16/8] sm:rounded-[2rem] lg:aspect-[16/6]">
          <NacreCover animated={coverUrl === undefined} idPrefix="cover" />
          {coverUrl ? <CoverPhoto src={coverUrl} /> : null}
        </div>

        <div className="relative -mt-12 grid gap-5 px-2.5 sm:-mt-[4.5rem] sm:px-7 lg:-mt-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-8 lg:gap-y-12 lg:px-10">
          <header className="relative rounded-[1.5rem] bg-background px-5 pb-6 shadow-lifted ring-1 ring-border/60 lg:col-start-1 lg:row-start-1 lg:rounded-[1.75rem] lg:px-10 lg:pb-9">
            <div className="flex flex-col items-center gap-3.5 text-center lg:grid lg:grid-cols-[112px_minmax(0,1fr)] lg:items-end lg:gap-x-7 lg:gap-y-4 lg:text-left">
              <div className="-mt-[42px] grid size-[84px] shrink-0 place-items-center overflow-hidden rounded-[1.5rem] bg-lavender-50 shadow-raised ring-4 ring-background lg:row-span-2 lg:-mt-10 lg:size-28 lg:self-start lg:rounded-[1.75rem]">
                {logoUrl ? (
                  // Shown whole, never stretched: a logo that is not square keeps its proportions.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-full w-full bg-background object-contain" decoding="async" />
                ) : (
                  <span aria-hidden="true" className="type-name text-[2.6rem] leading-none text-lavender-700 lg:text-[3.3rem]">
                    {initialOf(profile.name)}
                  </span>
                )}
              </div>
              <h1 className={cn(profileNameRole(profile.name), "min-w-0 max-w-full lg:pt-7")}>{profile.name}</h1>
              {profile.phone || profile.email ? (
                <div
                  role="group"
                  aria-label={`Contacter ${profile.name}`}
                  className="mt-1 grid w-full auto-cols-fr grid-flow-col gap-2 lg:mt-0 lg:flex lg:w-auto lg:flex-wrap"
                >
                  {profile.phone ? (
                    <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} className={actionChip}>
                      <PhoneIcon size={18} />
                      Appeler
                    </a>
                  ) : null}
                  {profile.email ? (
                    <a href={`mailto:${profile.email}`} className={actionChip}>
                      <MailIcon size={18} />
                      Écrire
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            {profile.description ? (
              <p className="type-body mt-6 max-w-[64ch] whitespace-pre-line break-words border-t border-border/70 pt-5 text-foreground/80 lg:mt-7 lg:pt-7">
                {profile.description}
              </p>
            ) : null}
          </header>

          <BookingCard profile={profile} canBook={canBook} hasContact={hasContact} />

          {hasDetails ? (
            <section aria-labelledby="contact" className="flex flex-col gap-4 px-2.5 pt-4 lg:col-start-1 lg:row-start-2 lg:px-2 lg:pt-0">
              <h2 id="contact" className="type-title">
                Contact
              </h2>
              <dl className="grid gap-x-8 border-t border-border/70 lg:grid-cols-2">
                {profile.phone ? (
                  <ContactRow icon={<PhoneIcon size={18} />} label="Téléphone">
                    <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} className={quietLink}>
                      {profile.phone}
                    </a>
                  </ContactRow>
                ) : null}
                {profile.email ? (
                  <ContactRow icon={<MailIcon size={18} />} label="E-mail">
                    <a href={`mailto:${profile.email}`} className={cn(quietLink, "[overflow-wrap:anywhere]")}>
                      {profile.email}
                    </a>
                  </ContactRow>
                ) : null}
                {location !== undefined ? <LocationRow location={location} /> : null}
              </dl>
            </section>
          ) : null}
        </div>
      </article>
    </Container>
  );
}

function ContactRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5 border-t border-border/60 py-4 first:border-t-0 lg:py-5 lg:[&:nth-child(2)]:border-t-0">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[0.875rem] bg-lavender-50 text-lavender-700">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="type-meta text-foreground/65">{label}</dt>
        <dd className="type-body min-w-0">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Booking, or why there is none: a sticky card beside the identity on a
 * desktop; on a phone, the call to action follows the reader at the bottom of
 * the screen until its own place comes into view, then docks there.
 */
function BookingCard({ profile, canBook, hasContact }: { profile: PublicProfile; canBook: boolean; hasContact: boolean }) {
  if (!canBook) {
    const paused = !profile.bookingEnabled;
    return (
      <section
        aria-labelledby="booking-status"
        className="flex flex-col items-start gap-3 rounded-[1.5rem] bg-lavender-50 p-6 ring-1 ring-lavender-100 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:rounded-[1.75rem] lg:p-7"
      >
        <Badge variant={paused ? "neutral" : "lavender"}>{paused ? "En pause" : "Bientôt disponible"}</Badge>
        <h2 id="booking-status" className="type-title">
          {paused ? "Les réservations en ligne sont en pause." : "La réservation en ligne arrive bientôt."}
        </h2>
        <p className="type-body-small text-foreground/75">
          {paused
            ? `${profile.name} ne prend pas de rendez-vous en ligne pour le moment.`
            : "Il n’est pas encore possible de prendre rendez-vous depuis cette page."}
          {hasContact ? ` Vous pouvez contacter ${profile.name} directement.` : ""}
        </p>
      </section>
    );
  }

  return (
    <aside
      aria-labelledby="booking-title"
      data-sticky-cta=""
      className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 lg:top-6 lg:bottom-auto lg:col-start-2 lg:row-span-2 lg:row-start-1"
    >
      <div className="flex flex-col gap-2 rounded-[1.5rem] bg-background p-3 shadow-[0_0_0_1px_rgb(223_222_228_/_0.7),0_12px_32px_rgba(31,28,61,0.14)] lg:gap-5 lg:rounded-[1.75rem] lg:bg-[linear-gradient(180deg,var(--bz-lavender-50)_0%,#fff_140px)] lg:p-7 lg:shadow-lifted lg:ring-1 lg:ring-border/60">
        <div className="hidden flex-col items-start gap-3 lg:flex">
          <Badge>
            <span aria-hidden="true" className="mr-1.5 size-1.5 rounded-full bg-accent" />
            Réservation en ligne
          </Badge>
          <h2 id="booking-title" className="type-title">
            Prenez <span className="whitespace-nowrap">rendez-vous</span> en ligne.
          </h2>
          <p className="type-body-small text-foreground/75">
            Choisissez une prestation et un horaire disponible, sans créer de compte.
          </p>
        </div>
        <Link href={bookingPath(profile.slug)} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          Prendre rendez-vous
          <LinkPendingGlyph />
        </Link>
        <p className="type-meta text-center text-foreground/60 lg:hidden">Sans créer de compte · réponse immédiate</p>
        <ul className="type-body-small hidden flex-col gap-2.5 pt-1 text-foreground/75 lg:flex">
          {["Sans créer de compte", "Réponse immédiate à l’écran", `Horaires ${describeTimeZone(profile.timeZone)}`].map((line) => (
            <li key={line} className="flex items-center gap-2.5">
              <CheckIcon size={16} className="shrink-0 text-accent" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export { PublicProfileView };
