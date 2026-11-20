import type { ReactNode } from "react";

import { NacreCover } from "@/components/brand/nacre-cover";
import { DirectionsIcon, PinIcon } from "@/components/ui/icons";
import type { DirectionsLinks } from "@/features/location/directions";
import { DIRECTIONS_LABEL } from "@/features/location/directions-chooser";
import type { LocationView } from "@/features/location/location-view";
import { SNAPSHOT_FRAME } from "@/features/location/snapshot-frame";
import { cn } from "@/lib/utils";

import { DirectionsTrigger } from "./directions-chooser";
import { MapSnapshotImage } from "./map-snapshot-image";

/**
 * Where a professional receives her clients, as her page may show it — the
 * functional location of the public pages. Presentation only: what may be
 * shown was decided by the server (`online_booking_public_location`) and put
 * into a `LocationView`; nothing here reads a profile, and nothing here can
 * show more than the view holds.
 *
 *   a complete address   on the left, its two lines and « Itinéraire »; on
 *                        the right, the map — the same action as
 *                        « Itinéraire », and nothing under it
 *   a city               the city name; a town-level map without a marker;
 *                        no link, no directions, nothing to open
 *   no location          these components are not rendered at all
 *
 * « Itinéraire » and the map do the same thing, decided by the visitor's
 * platform (`directions.ts`, `directions-chooser.tsx`): « Ouvrir avec »
 * — Apple Plans or Google Maps — on an iPhone or an iPad, Apple Plans
 * directly on a Mac, Google Maps directly on Android and everywhere else.
 * Never another application, and never a second link beside them.
 *
 * The map is an Apple Maps snapshot when the server could sign one, over the
 * Nacre artwork that stands in for it — while it loads, when it cannot be
 * read, or when there is none. Apple's own marks are drawn on its image, which
 * is shown whole; the artwork never pretends to be a map, and the directions
 * never depend on the image.
 *
 * Every link opens a new tab (or the application): the booking flow keeps its
 * state. Nothing asks for the visitor's position.
 */

const quietLink =
  "font-medium text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700";
/** « Itinéraire »: a 44 px target, the contact chips' own lavender. */
const directionsButton =
  "type-label inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-lavender-200 bg-lavender-25 px-4 text-lavender-700 transition-colors duration-[var(--bz-duration-state)] hover:bg-lavender-50";

/** « Itinéraire » — a button, or a quiet link inside a summary (`compact`). The only directions action there is. */
export function DirectionsActions({
  directions,
  spoken,
  compact = false,
  className,
}: {
  directions: DirectionsLinks;
  /** The address in one line. */
  spoken: string;
  /** Inside a summary: quiet links instead of a button. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <span data-directions="" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      <DirectionsTrigger
        directions={directions}
        spoken={spoken}
        className={compact ? cn(quietLink, "type-body-small inline-flex min-h-11 items-center gap-1.5") : directionsButton}
      >
        <DirectionsIcon size={compact ? 16 : 18} />
        {DIRECTIONS_LABEL}
      </DirectionsTrigger>
    </span>
  );
}

/**
 * The map of a location: the snapshot over the Nacre artwork, in the
 * snapshot's own 2 : 1. A complete address makes it the same action as
 * « Itinéraire » (the artwork then carries a pin), with nothing under it; a
 * city makes it a quiet picture — no marker, no link.
 */
export function LocationMap({ location, idPrefix, className }: { location: LocationView; idPrefix: string; className?: string }) {
  const exact = location.kind === "address";
  const directions = exact ? location.directions : undefined;
  const picture = (
    <>
      <NacreCover animated={false} idPrefix={`${idPrefix}-place`} />
      {exact ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-10 place-items-center rounded-full bg-background/90 text-lavender-700 shadow-card">
            <PinIcon size={18} />
          </span>
        </span>
      ) : null}
      {location.mapUrl !== undefined ? <MapSnapshotImage src={location.mapUrl} width={SNAPSHOT_FRAME.width} height={SNAPSHOT_FRAME.height} /> : null}
    </>
  );
  const frame = "relative block aspect-[2/1] w-full overflow-hidden rounded-[1.1rem] bg-lavender-100 ring-1 ring-lavender-100";
  return (
    <div data-location-map="" data-map-kind={exact ? "address" : "city"} className={cn("flex flex-col gap-1", className)}>
      {exact && directions !== undefined ? (
        <DirectionsTrigger
          directions={directions}
          spoken={location.spoken}
          className={cn(frame, "transition-shadow duration-[var(--bz-duration-state)] hover:shadow-raised hover:ring-lavender-200")}
        >
          {picture}
        </DirectionsTrigger>
      ) : (
        <div aria-hidden="true" className={frame}>
          {picture}
        </div>
      )}
    </div>
  );
}

function Tile({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[0.875rem] bg-lavender-50 text-lavender-700">
      {children}
    </span>
  );
}

/**
 * The location among the contact details of a public profile — a row of its
 * `<dl>`: the address (or the city) and « Itinéraire », the map under them on
 * a phone and beside them from 640 px.
 */
export function LocationRow({ location, idPrefix = "profile" }: { location: LocationView; idPrefix?: string }) {
  const exact = location.kind === "address";
  return (
    <div
      data-location={location.kind}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3.5 gap-y-4 border-t border-border/60 py-5 first:border-t-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,17rem)] lg:col-span-2"
    >
      <Tile>
        <PinIcon size={18} />
      </Tile>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="type-meta text-foreground/65">{exact ? "Adresse" : "Lieu"}</dt>
        <dd className="type-body max-w-[48ch] break-words">
          {exact ? (
            location.lines.map((line, index) => (
              <span key={index} className="block">
                {line}
              </span>
            ))
          ) : (
            location.city
          )}
        </dd>
        {exact && location.directions !== undefined ? (
          <dd className="pt-1.5">
            <DirectionsActions directions={location.directions} spoken={location.spoken} />
          </dd>
        ) : null}
      </div>
      <dd className="col-span-2 sm:col-span-1">
        <LocationMap location={location} idPrefix={idPrefix} />
      </dd>
    </div>
  );
}

/**
 * The location on its own — the confirmation of a booking: where to go, how
 * to get there, the map. For a city, the place in words and whom to ask for
 * the rest.
 */
export function LocationPanel({
  location,
  professionalName,
  headingId,
  idPrefix = "booking",
}: {
  location: LocationView;
  professionalName: string;
  headingId: string;
  idPrefix?: string;
}) {
  const exact = location.kind === "address";
  return (
    <section
      aria-labelledby={headingId}
      data-location={location.kind}
      className="grid gap-5 rounded-[1.5rem] border border-border/80 bg-background px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] sm:items-start sm:px-7"
    >
      <div className="flex min-w-0 gap-3.5">
        <Tile>
          <PinIcon size={18} />
        </Tile>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={headingId} className="type-meta text-foreground/65">
            Lieu du rendez-vous
          </h3>
          <p className="type-body break-words">
            {exact ? (
              location.lines.map((line, index) => (
                <span key={index} className="block">
                  {line}
                </span>
              ))
            ) : (
              location.city
            )}
          </p>
          {exact ? (
            location.directions !== undefined ? (
              <DirectionsActions directions={location.directions} spoken={location.spoken} className="pt-1.5" />
            ) : null
          ) : (
            <p className="type-body-small text-foreground/65">Pour l’adresse exacte, contactez {professionalName}.</p>
          )}
        </div>
      </div>
      <LocationMap location={location} idPrefix={idPrefix} />
    </section>
  );
}

/**
 * The location inside a summary (the appointment panel, the review): the
 * address lines and « Itinéraire », or the city. No map.
 */
export function LocationLines({ location, muted = false }: { location: LocationView; muted?: boolean }) {
  if (location.kind === "city") return <span className="block">{location.city}</span>;
  return (
    <>
      {location.lines.map((line, index) => (
        <span key={index} className={cn("block", muted ? "text-foreground/75" : undefined)}>
          {line}
        </span>
      ))}
      {location.directions !== undefined ? <DirectionsActions compact directions={location.directions} spoken={location.spoken} /> : null}
    </>
  );
}
