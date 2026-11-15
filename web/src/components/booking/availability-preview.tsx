import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  datesOfWindow,
  describeTimeZone,
  formatDuration,
  formatLongDate,
  formatShortDate,
  type Availability,
  type AvailabilityQuery,
} from "@/features/availability/availability";
import { getAvailability } from "@/features/availability/get-availability";
import type { PublicProfile } from "@/features/public-profile/public-profile";
import { bookingPath, profilePath } from "@/features/public-profile/slug";
import { cn } from "@/lib/utils";

import { BookingInactiveNotice } from "./booking-inactive-notice";

const sectionTitle = "type-title";
const quiet = "type-body-small text-foreground/70";
const choice =
  "rounded-[1.25rem] border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";
const chosen = "border-accent bg-lavender-50 text-lavender-700";
const notChosen = "border-border bg-background hover:bg-lavender-25";

function previewHref(slug: string, serviceId: string, date?: string): string {
  const params = new URLSearchParams({ service: serviceId });
  if (date !== undefined) params.set("date", date);
  return `${bookingPath(slug)}?${params.toString()}`;
}

function Notice({ title, body, tone = "neutral" }: { title: string; body?: string; tone?: "neutral" | "danger" }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-1 rounded-[1.25rem] px-5 py-4",
        tone === "danger" ? "bg-danger-surface text-danger" : "bg-surface text-foreground/80",
      )}
    >
      <p className="type-subtitle">{title}</p>
      {body ? <p className="type-body-small">{body}</p> : null}
    </div>
  );
}

function PreviewHeader({ name }: { name: string }) {
  return (
    <header className="flex flex-col items-start gap-4">
      <Badge>Aperçu</Badge>
      <h1 className="type-headline [overflow-wrap:anywhere]">
        Disponibilités de {name}
      </h1>
      <p className="type-lead max-w-xl text-foreground/75">
        La réservation en ligne n&apos;est pas encore ouverte : ces horaires sont un aperçu et ne
        peuvent pas être réservés depuis cette page.
      </p>
    </header>
  );
}

/** What the preview shows while the availability is being computed. */
function AvailabilityLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4" role="status">
      <span className="sr-only">Chargement des disponibilités…</span>
      <div className="h-6 w-40 animate-pulse rounded-full bg-lavender-100" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-full bg-lavender-50" />
        ))}
      </div>
    </div>
  );
}

function ServiceChoices({ slug, availability }: { slug: string; availability: Availability }) {
  return (
    <section aria-labelledby="services" className="flex flex-col gap-4">
      <h2 id="services" className={sectionTitle}>
        Prestation
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {availability.services.map((service) => {
          const selected = availability.service?.id === service.id;
          return (
            <li key={service.id}>
              <Link
                aria-current={selected ? "true" : undefined}
                className={cn(choice, "flex min-h-11 items-center justify-between gap-4", selected ? chosen : notChosen)}
                href={previewHref(slug, service.id, availability.date)}
                scroll={false}
              >
                <span className="type-subtitle">{service.name}</span>
                <span className="type-meta shrink-0 tabular-nums text-foreground/70">
                  {formatDuration(service.durationMinutes)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DateChoices({ slug, availability, serviceId }: { slug: string; availability: Availability; serviceId: string }) {
  return (
    <section aria-labelledby="dates" className="flex flex-col gap-4">
      <h2 id="dates" className={sectionTitle}>
        Date
      </h2>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {datesOfWindow(availability.firstDate, availability.lastDate).map((date) => {
          const selected = availability.date === date;
          return (
            <li key={date} className="shrink-0">
              <Link
                aria-current={selected ? "date" : undefined}
                aria-label={formatLongDate(date)}
                className={cn(choice, "type-label flex min-h-11 items-center whitespace-nowrap tabular-nums", selected ? chosen : notChosen)}
                href={previewHref(slug, serviceId, date)}
                scroll={false}
              >
                {formatShortDate(date)}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SlotList({ availability }: { availability: Availability }) {
  const date = availability.date;
  return (
    <section aria-labelledby="slots" className="flex flex-col gap-4">
      <h2 id="slots" className={sectionTitle}>
        Horaires{date ? ` du ${formatLongDate(date)}` : ""}
      </h2>
      {availability.status === "OUT_OF_WINDOW" ? (
        <Notice
          title="Cette date n’est pas ouverte."
          body={`Choisissez une date entre le ${formatLongDate(availability.firstDate)} et le ${formatLongDate(availability.lastDate)}.`}
        />
      ) : availability.slots.length === 0 ? (
        <Notice title="Aucun horaire disponible ce jour-là." body="Essayez une autre date." />
      ) : (
        <>
          {/* Read-only: a time is shown, never selectable — nothing can be booked yet. */}
          <ul aria-label="Horaires disponibles" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {availability.slots.map((slot) => (
              <li
                key={slot.startsAt}
                className="type-figure flex min-h-11 items-center justify-center rounded-full border border-lavender-200 bg-lavender-25 text-lavender-700"
              >
                <time dateTime={slot.startsAt}>{slot.localTime}</time>
              </li>
            ))}
          </ul>
          <p className={quiet}>
            Horaires {describeTimeZone(availability.timeZone)}. Ils sont recalculés à chaque visite et
            peuvent changer : un horaire affiché n&apos;est jamais réservé.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * The read-only availability preview (development and Staging only — see
 * `isAvailabilityPreviewEnabled`). Services, dates and times are links and
 * labels; there is no form, no button that books, no customer field.
 */
async function AvailabilityPreview({ profile, query }: { profile: PublicProfile; query: AvailabilityQuery }) {
  let availability: Availability | null;
  try {
    availability = await getAvailability(profile.slug, query);
    // A service without a date: the first bookable date, in the same request.
    if (availability?.status === "CHOOSE_DATE" && query.serviceId !== undefined) {
      availability = await getAvailability(profile.slug, { serviceId: query.serviceId, date: availability.firstDate });
    }
  } catch {
    return (
      <div className="flex flex-col gap-8">
        <PreviewHeader name={profile.name} />
        <Notice
          tone="danger"
          title="Les disponibilités n’ont pas pu être chargées."
          body="Réessayez dans un instant."
        />
        <Button asChild variant="secondary" className="self-start">
          <Link href={query.serviceId ? previewHref(profile.slug, query.serviceId, query.date) : bookingPath(profile.slug)}>
            Réessayer
          </Link>
        </Button>
      </div>
    );
  }

  // The page does not accept bookings: the same notice as without the preview.
  if (availability === null) return <BookingInactiveNotice profile={profile} />;

  return (
    <div className="flex flex-col gap-10">
      <PreviewHeader name={profile.name} />

      {availability.services.length === 0 ? (
        <Notice title="Aucune prestation n’est encore proposée en ligne." />
      ) : (
        <ServiceChoices slug={profile.slug} availability={availability} />
      )}

      {availability.status === "UNKNOWN_SERVICE" ? (
        <Notice title="Cette prestation n’est pas proposée en ligne." body="Choisissez une prestation ci-dessus." />
      ) : null}

      {availability.service !== undefined ? (
        <DateChoices slug={profile.slug} availability={availability} serviceId={availability.service.id} />
      ) : null}

      {availability.status === "SLOTS" || availability.status === "OUT_OF_WINDOW" ? (
        <SlotList availability={availability} />
      ) : null}

      <Button asChild variant="secondary" className="self-start">
        <Link href={profilePath(profile.slug)}>Retour à la page de {profile.name}</Link>
      </Button>
    </div>
  );
}

export { AvailabilityLoading, AvailabilityPreview };
