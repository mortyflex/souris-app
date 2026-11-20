import { useRef, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { CalendarIcon, CheckIcon, ClockIcon, PinIcon, UserIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  datesOfWindow,
  describeTimeZone,
  formatDuration,
  formatLongDate,
  formatShortDate,
  type AvailableSlot,
  type BookableService,
} from "@/features/availability/availability";
import { MAX_SELECTED_SERVICES, type ServiceChange } from "@/features/availability/selection";
import { groupBookableServices, PRICES_NOTE, showsAnyPrice } from "@/features/availability/service-catalog";
import type { ConfirmedBooking } from "@/features/booking/booking-answer";
import type { FlowNotice } from "@/features/booking/booking-flow";
import type { ChallengeState } from "@/features/booking/challenge";
import type { CustomerDetails, CustomerField, FieldIssue } from "@/features/booking/booking-request";
import { formatTimeInZone, formatTimeRange } from "@/features/booking/local-time";
import type { LocationView } from "@/features/location/location-view";
import { cn } from "@/lib/utils";

import { DateStrip } from "./date-strip";
import { LocationLines, LocationPanel } from "./location-card";
import { groupSlotsByPeriod, skeletonCount } from "./date-strip-rules";
import { ServiceCard } from "./service-card";
import { TEXT_LINK } from "./text-link";
import {
  ChangesList,
  INDICATIVE_NOTE,
  SELECTION_LIMIT_ID,
  SelectedServicesList,
  SelectionLimitNote,
  SelectionPanel,
  SelectionStickyBar,
  SelectionTotals,
} from "./selection-summary";

/**
 * The screens of the public booking flow — presentation only. State, network
 * and history live in `booking-flow.tsx`; every rule lives in
 * `src/features/booking/`. Nothing here computes a time: starts are the
 * server's labels, ends are formatted in the professional's time zone. Nothing
 * here decides what is shown of her location either: it is the view the
 * server made from the level she chose (`LocationView`) — the same on every
 * step, the confirmation included — or nothing at all.
 */

export interface Professional {
  readonly name: string;
  /**
   * Her location as her page publishes it: a complete address (with its
   * directions and its map), a city, or — absent — nothing. A booking never
   * shows more than the page it was made from.
   */
  readonly location?: LocationView;
  readonly phone?: string;
  readonly email?: string;
}

const quiet = "type-body-small text-foreground/70";
const link = TEXT_LINK;

/** « Lundi 16 novembre » */
export function capitalized(text: string): string {
  return text.length === 0 ? text : `${text[0].toLocaleUpperCase("fr-FR")}${text.slice(1)}`;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
export function StepHeading({ headingRef, children }: { headingRef?: Ref<HTMLHeadingElement>; children: ReactNode }) {
  return (
    <h2 ref={headingRef} id="booking-step-heading" tabIndex={-1} className="type-title outline-none focus-visible:outline-2">
      {children}
    </h2>
  );
}

export function ContactLinks({ professional }: { professional: Professional }) {
  if (!professional.phone && !professional.email) return null;
  return (
    <p className="type-body-small flex flex-wrap gap-x-5 gap-y-1">
      {professional.phone ? (
        <a className={link} href={`tel:${professional.phone.replace(/[^\d+]/g, "")}`}>
          {professional.phone}
        </a>
      ) : null}
      {professional.email ? (
        <a className={cn(link, "[overflow-wrap:anywhere]")} href={`mailto:${professional.email}`}>
          {professional.email}
        </a>
      ) : null}
    </p>
  );
}

interface NoticeCopy {
  readonly title: string;
  readonly body: string;
  readonly tone: "neutral" | "danger";
  /** Show the professional's published contact under the notice. */
  readonly contact?: boolean;
}

/**
 * The words of a notice. `services` names the services it is about, when the
 * flow knows them (a selection that lost one).
 */
export function noticeCopy(notice: FlowNotice, professionalName: string, services: readonly string[] = []): NoticeCopy {
  switch (notice) {
    case "SLOT_TAKEN":
      return {
        tone: "danger",
        title: "Ce créneau vient d’être réservé.",
        body: "Choisissez un autre horaire : vos coordonnées sont conservées.",
      };
    case "SERVICE_GONE":
      if (services.length === 1) {
        return {
          tone: "danger",
          title: `« ${services[0]} » n’est plus proposée en ligne.`,
          body: "Elle a été retirée de votre sélection : vérifiez-la, puis choisissez un horaire.",
        };
      }
      if (services.length > 1) {
        return {
          tone: "danger",
          title: "Certaines prestations ne sont plus proposées en ligne.",
          body: `Elles ont été retirées de votre sélection (${services.map((name) => `« ${name} »`).join(", ")}) : vérifiez-la, puis choisissez un horaire.`,
        };
      }
      return { tone: "danger", title: "Cette prestation n’est plus proposée en ligne.", body: "Choisissez une autre prestation." };
    case "SELECTION_CHANGED":
      return {
        tone: "danger",
        title: "Votre sélection a changé.",
        body: `Rien n’a été réservé. Une ou plusieurs prestations ont été modifiées depuis que vous les avez choisies${
          services.length === 0
            ? ""
            : services.length === 1
              ? `, et « ${services[0]} » n’est plus proposée en ligne : elle a été retirée de votre sélection`
              : `, et ${services.map((name) => `« ${name} »`).join(", ")} ne sont plus proposées en ligne : elles ont été retirées de votre sélection`
        }. Vérifiez les informations à jour, puis choisissez à nouveau un horaire.`,
      };
    case "SELECTION_UPDATED":
      return {
        tone: "neutral",
        title: "Les informations de votre sélection ont été mises à jour.",
        body: "Vérifiez-les dans le récapitulatif, puis choisissez à nouveau un horaire.",
      };
    case "SELECTION_TOO_LONG":
      return {
        tone: "danger",
        title: "Votre sélection dépasse 12 h.",
        body: "Rien n’a été réservé. Retirez une ou plusieurs prestations, puis choisissez un horaire.",
      };
    case "SELECTION_RESTORED":
      return {
        tone: "neutral",
        title: "Votre sélection a changé depuis votre dernière visite.",
        body: "Les prestations qui ne sont plus proposées en ligne en ont été retirées. Vérifiez-la avant de choisir un horaire.",
      };
    case "REQUEST_REFUSED":
      return {
        tone: "danger",
        title: "Votre demande n’a pas pu être prise en compte.",
        body: "Choisissez à nouveau votre horaire : vos coordonnées sont conservées.",
      };
    case "BUSY":
      return {
        tone: "neutral",
        title: "L’agenda est très sollicité en ce moment.",
        body: "Votre rendez-vous n’est pas encore réservé. Réessayez dans un instant : la même demande sera renvoyée.",
      };
    case "UNCERTAIN":
      return {
        tone: "danger",
        title: "Nous n’avons pas pu confirmer votre rendez-vous.",
        body: "Il a peut-être été enregistré. Réessayez : la même demande est renvoyée et ne sera jamais enregistrée deux fois.",
        contact: true,
      };
    case "RATE_LIMITED":
      return {
        tone: "neutral",
        title: "Trop de demandes ont été envoyées depuis votre connexion.",
        body: "Patientez quelques minutes, puis réessayez.",
      };
    case "PROTECTION_UNAVAILABLE":
      return {
        tone: "neutral",
        title: "La réservation en ligne est momentanément indisponible.",
        body: "Votre rendez-vous n’est pas réservé. Réessayez un peu plus tard.",
        contact: true,
      };
    case "CHALLENGE_FAILED":
      return {
        tone: "neutral",
        title: "La vérification de sécurité a expiré.",
        body: "Votre rendez-vous n’est pas encore réservé. Une nouvelle vérification vient d’être lancée : confirmez à nouveau dès qu’elle est terminée.",
      };
    case "KEY_REUSED":
      return {
        tone: "danger",
        title: "Cette demande n’a pas pu être enregistrée.",
        body: "Une autre réservation a déjà été faite avec cette même demande ; rien n’a été réservé cette fois-ci. Si vous souhaitez ce rendez-vous, confirmez-le à nouveau.",
      };
    case "CLOSED":
      return {
        tone: "neutral",
        title: "La réservation en ligne n’est pas disponible pour le moment.",
        body: `Aucun rendez-vous n’a été réservé. Vous pouvez contacter ${professionalName} directement.`,
        contact: true,
      };
    case "CLOSED_UNCERTAIN":
      return {
        tone: "danger",
        title: "Nous ne pouvons pas confirmer votre rendez-vous.",
        body: `La réservation en ligne vient d’être fermée et votre demande précédente a peut-être été enregistrée. Contactez ${professionalName} pour le vérifier.`,
        contact: true,
      };
  }
}

export function FlowNoticeBox({
  notice,
  professional,
  services,
  changes = [],
}: {
  notice: FlowNotice;
  professional: Professional;
  /** The services the notice is about, by name. */
  services?: readonly string[];
  /** What changed in the selection (SELECTION_CHANGED, SELECTION_UPDATED). */
  changes?: readonly ServiceChange[];
}) {
  const copy = noticeCopy(notice, professional.name, services);
  return (
    <div
      role={copy.tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-1.5 rounded-[1.25rem] px-5 py-4",
        copy.tone === "danger" ? "bg-danger-surface text-danger" : "bg-surface text-foreground/80",
      )}
    >
      <p className="type-subtitle">{copy.title}</p>
      <p className="type-body-small">{copy.body}</p>
      <ChangesList changes={changes} />
      {copy.contact ? <ContactLinks professional={professional} /> : null}
    </div>
  );
}

const CHALLENGE_STATUS_ID = "booking-challenge-status";

/**
 * Where the security check stands, next to the confirmation button. Usually a
 * short « en cours » line; a visible request when Cloudflare needs the
 * customer; a way to try again when it cannot run. Nothing while sending.
 */
export function ChallengeStatus({
  challenge,
  professional,
  onRetry,
}: {
  challenge: ChallengeState;
  professional: Professional;
  onRetry: () => void;
}) {
  if (challenge.status === "error") {
    return (
      <div id={CHALLENGE_STATUS_ID} role="alert" className="flex flex-col gap-1.5 rounded-[1.25rem] bg-danger-surface px-5 py-4 text-danger">
        <p className="type-subtitle">La vérification de sécurité n’a pas pu aboutir.</p>
        <p className="type-body-small">
          Votre rendez-vous n’est pas encore réservé. Vérifiez votre connexion ou désactivez un éventuel bloqueur de
          contenu, puis relancez la vérification.
        </p>
        <div className="pt-1">
          <Button type="button" variant="secondary" onClick={onRetry}>
            Relancer la vérification
          </Button>
        </div>
        <ContactLinks professional={professional} />
      </div>
    );
  }
  const message =
    challenge.status === "checking"
      ? "Vérification de sécurité en cours…"
      : challenge.status === "interactive"
        ? "Pour confirmer, complétez la vérification de sécurité ci-dessus."
        : "Vérification de sécurité terminée.";
  return (
    <p id={CHALLENGE_STATUS_ID} role="status" className={cn(quiet, challenge.status === "ready" && "sr-only")}>
      {message}
    </p>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">{children}</div>;
}

// ---------------------------------------------------------------------------
// 1. Service
// ---------------------------------------------------------------------------
/** `selection` mode: her ordered selection and what can be done with it. */
export interface ServiceSelection {
  readonly services: readonly BookableService[];
  readonly onAdd: (service: BookableService) => void;
  readonly onRemove: (serviceId: string) => void;
  readonly onChooseTimes: () => void;
}

export function ServiceStep({
  services,
  selectedId,
  loading,
  issue,
  onRetry,
  onChoose,
  headingRef,
  professional,
  selection,
}: {
  services: readonly BookableService[];
  selectedId?: string;
  loading?: boolean;
  /** The list could not be read again: it may be out of date. */
  issue?: "error" | "limited";
  onRetry?: () => void;
  onChoose: (service: BookableService) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  professional: Professional;
  /** Several services per booking (`selection` mode): add, remove, then « Choisir un horaire ». */
  selection?: ServiceSelection;
}) {
  const content = (
    <section aria-labelledby="booking-step-heading" className="flex min-w-0 flex-col gap-5">
      {selection === undefined ? (
        <StepHeading headingRef={headingRef}>Choisissez une prestation</StepHeading>
      ) : (
        <div className="flex flex-col gap-2">
          <StepHeading headingRef={headingRef}>Choisissez vos prestations</StepHeading>
          <p className="type-body-small text-foreground/75">
            Jusqu’à {MAX_SELECTED_SERVICES} prestations pour un même rendez-vous : elles s’enchaînent dans l’ordre où vous les
            ajoutez.
          </p>
        </div>
      )}
      {loading ? (
        <p role="status" className={cn(quiet, "flex items-center gap-2 text-lavender-700")}>
          <Spinner size={14} />
          Mise à jour des prestations…
        </p>
      ) : issue ? (
        <div role="status" className="flex flex-col items-start gap-3 rounded-[1.25rem] bg-surface px-5 py-4">
          <p className="type-subtitle">
            {issue === "limited" ? "Trop de demandes depuis votre connexion." : "La liste des prestations n’a pas pu être mise à jour."}
          </p>
          <p className={quiet}>{issue === "limited" ? "Patientez quelques minutes, puis réessayez." : "Elle n’est peut-être plus à jour."}</p>
          {onRetry ? (
            <Button type="button" variant="secondary" onClick={onRetry}>
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}
      {services.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-[1.25rem] bg-surface px-5 py-4">
          <p className="type-subtitle">Aucune prestation n’est proposée en ligne pour le moment.</p>
          <p className={quiet}>Vous pouvez contacter {professional.name} directement.</p>
          <ContactLinks professional={professional} />
        </div>
      ) : (
        <ServiceList services={services} selectedId={selectedId} loading={loading} onChoose={onChoose} selection={selection} />
      )}
      {selection !== undefined ? (
        <>
          {/* Phone and tablet: the selection at the end of the step, and ONE « Choisir un horaire » —
              the sticky bar's, which follows the reader then docks right under this card. */}
          <SelectionPanel
            services={selection.services}
            onRemove={selection.onRemove}
            onChooseTimes={selection.onChooseTimes}
            disabled={loading}
            offersChooseTimes={false}
            className={cn("flex lg:hidden", selection.services.length === 0 && "hidden")}
          />
          <SelectionStickyBar services={selection.services} onChooseTimes={selection.onChooseTimes} disabled={loading} className="lg:hidden" />
        </>
      ) : null}
    </section>
  );
  if (selection === undefined) return content;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
      {content}
      <SelectionPanel
        services={selection.services}
        onRemove={selection.onRemove}
        onChooseTimes={selection.onChooseTimes}
        disabled={loading}
        className="sticky top-6 hidden lg:flex"
      />
    </div>
  );
}

/**
 * The services as cards, grouped by the professional's categories when the
 * server gave some (`groupBookableServices`); a plain list otherwise — the very
 * list a server without categories always gave. ONE selected service.
 */
function ServiceList({
  services,
  selectedId,
  loading,
  onChoose,
  selection,
}: {
  services: readonly BookableService[];
  selectedId?: string;
  loading?: boolean;
  onChoose: (service: BookableService) => void;
  selection?: ServiceSelection;
}) {
  const groups = groupBookableServices(services);
  const titled = groups.some((group) => group.title !== undefined);
  const chosen = selection?.services.map((service) => service.id) ?? [];
  const canAdd = chosen.length < MAX_SELECTED_SERVICES;
  const cards = (list: readonly BookableService[]) => (
    // Two columns from `sm`: the cards of a row share its height and their actions one baseline. The
    // description is a two-line preview (ServiceCard), so a row is never taller than its longest name.
    <ul aria-busy={loading || undefined} className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {list.map((service) => {
        const index = chosen.indexOf(service.id);
        return (
          <li key={service.id} className="min-w-0">
            <ServiceCard
              service={service}
              selected={selection === undefined ? service.id === selectedId : index >= 0}
              disabled={loading}
              headingLevel={titled ? 4 : 3}
              onChoose={() => onChoose(service)}
              {...(selection !== undefined
                ? {
                    selectionAction: {
                      ...(index >= 0 ? { position: index + 1 } : {}),
                      canAdd,
                      limitId: SELECTION_LIMIT_ID,
                      onAdd: () => selection.onAdd(service),
                      onRemove: () => selection.onRemove(service.id),
                    },
                  }
                : {})}
            />
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-7">
      {selection !== undefined ? <SelectionLimitNote count={chosen.length} /> : null}
      {groups.map((group) =>
        group.title === undefined ? (
          <div key={group.key}>{cards(group.services)}</div>
        ) : (
          <section key={group.key} aria-labelledby={`booking-services-${group.key}`} className="flex flex-col gap-3.5">
            <h3 id={`booking-services-${group.key}`} className="flex items-center gap-2.5 after:h-px after:flex-1 after:bg-border/70">
              <span className="type-label min-w-0 [overflow-wrap:anywhere]">{group.title}</span>
              <span className="type-meta shrink-0 text-foreground/55">
                {group.services.length} prestation{group.services.length > 1 ? "s" : ""}
              </span>
            </h3>
            {cards(group.services)}
          </section>
        ),
      )}
      {showsAnyPrice(services) ? <p className="type-meta text-foreground/60">{PRICES_NOTE}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Date and time
// ---------------------------------------------------------------------------
export type SlotsView =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "limited" }
  | { readonly status: "out_of_window" }
  | { readonly status: "ready"; readonly slots: readonly AvailableSlot[] }
  /** The selection is longer than 12 hours: no date can offer it. */
  | { readonly status: "too_long"; readonly durationMinutes: number }
  /** The selection is longer than every working interval of the window: no date can offer it. */
  | { readonly status: "does_not_fit"; readonly durationMinutes: number; readonly longestIntervalMinutes: number };

export function SlotStep({
  services,
  durationMinutes,
  selectionMode = false,
  window,
  date,
  slot,
  slots,
  timeZone,
  professional,
  loadingCount,
  onChangeService,
  onChooseDate,
  onChooseSlot,
  onRetry,
  onBack,
  onContinue,
  headingRef,
}: {
  /** What is being booked, in order (one service in the single-service flow). */
  services: readonly BookableService[];
  /** The server's combined length when it gave one; the sum of the services otherwise. */
  durationMinutes?: number;
  /** Several services per booking: the selection is shown with its prices and can be edited. */
  selectionMode?: boolean;
  window: { readonly firstDate: string; readonly lastDate: string };
  date?: string;
  slot?: AvailableSlot;
  slots: SlotsView;
  timeZone: string;
  /** Shown in the appointment summary beside the step (desktop). */
  professional?: Professional;
  /** How many placeholders the loading grid draws (the last day seen). */
  loadingCount?: number;
  onChangeService: () => void;
  onChooseDate: (date: string) => void;
  onChooseSlot: (slot: AvailableSlot) => void;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const timesHeadingRef = useRef<HTMLHeadingElement>(null);
  const dates = datesOfWindow(window.firstDate, window.lastDate);
  const nextDate = date === undefined ? undefined : dates[dates.indexOf(date) + 1];
  // A control inside the times region is replaced by the loading grid: the focus moves to the times' heading.
  const focusTimes = () => {
    requestAnimationFrame(() => timesHeadingRef.current?.focus());
  };
  const selection = slot && date ? `${capitalized(formatShortDate(date))} · ${slot.localTime}` : undefined;
  const minutes = durationMinutes ?? services.reduce((total, service) => total + service.durationMinutes, 0);
  const what = selectionMode
    ? `${services.length} prestation${services.length > 1 ? "s" : ""}`
    : services[0]?.name ?? "";
  const cannotFit = slots.status === "too_long" || slots.status === "does_not_fit";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
      <section
        aria-labelledby="booking-step-heading"
        className="flex min-w-0 flex-col gap-7 lg:rounded-[1.75rem] lg:bg-background lg:p-9 lg:shadow-card lg:ring-1 lg:ring-border/65"
      >
        <div className="flex flex-col gap-2">
          <StepHeading headingRef={headingRef}>Choisissez une date et un horaire</StepHeading>
          <p className="type-body-small flex flex-wrap items-center gap-x-3 text-foreground/75">
            <span>
              {what} · <span className="tabular-nums">{formatDuration(minutes)}</span>
            </span>
            <button type="button" onClick={onChangeService} className={cn(link, "min-h-11")}>
              {selectionMode ? "Modifier la sélection" : "Changer de prestation"}
            </button>
          </p>
        </div>

        {professional?.location ? <StepLocation location={professional.location} /> : null}

        {cannotFit ? (
          <CannotFit view={slots} professional={professional} onChangeService={onChangeService} />
        ) : (
        <>
        <DateStrip dates={dates} selected={date} onChoose={onChooseDate} />

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <h3
              ref={timesHeadingRef}
              id="booking-times"
              tabIndex={-1}
              className="type-label rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {date ? `Horaires du ${formatLongDate(date)}` : "Horaires"}
            </h3>
            <span className="type-meta text-foreground/60">Horaires {describeTimeZone(timeZone)}</span>
          </div>

          {slots.status === "loading" ? (
            <div aria-busy="true" className="flex flex-col gap-6">
              <span className="sr-only">Chargement des horaires…</span>
              {splitForSkeleton(skeletonCount(loadingCount)).map((count, index) => (
                <div key={index} className="flex flex-col gap-3">
                  <Skeleton className="h-3.5 w-28" />
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-2.5 lg:grid-cols-6">
                    {Array.from({ length: count }, (_, cell) => (
                      <Skeleton key={cell} className="h-11" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : slots.status === "error" ? (
            <div className="flex flex-col items-start gap-3 rounded-[1.25rem] bg-danger-surface px-5 py-4 text-danger" role="alert">
              <p className="type-subtitle">Les horaires n’ont pas pu être chargés.</p>
              <Button type="button" variant="secondary" onClick={() => {
                  onRetry();
                  focusTimes();
                }}>
                Réessayer
              </Button>
            </div>
          ) : slots.status === "limited" ? (
            <div className="flex flex-col items-start gap-3 rounded-[1.25rem] bg-surface px-5 py-4" role="status">
              <p className="type-subtitle">Trop de demandes depuis votre connexion.</p>
              <p className={quiet}>Patientez quelques minutes, puis réessayez.</p>
              <Button type="button" variant="secondary" onClick={() => {
                  onRetry();
                  focusTimes();
                }}>
                Réessayer
              </Button>
            </div>
          ) : slots.status === "out_of_window" ? (
            <div className="rounded-[1.25rem] bg-surface px-5 py-4" role="status">
              <p className="type-subtitle">Cette date n’est plus ouverte à la réservation.</p>
              <p className={quiet}>Choisissez une autre date.</p>
            </div>
          ) : slots.status !== "ready" ? null : slots.slots.length === 0 ? (
            <div className="flex flex-col items-start gap-3.5 rounded-[1.4rem] bg-lavender-25 p-5 ring-1 ring-inset ring-lavender-100" role="status">
              <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-background text-lavender-700 shadow-card">
                <CalendarIcon size={22} />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="type-subtitle">Aucun horaire disponible ce jour-là.</p>
                {nextDate ? null : <p className={quiet}>Essayez une autre date.</p>}
              </div>
              {nextDate ? (
                <Button type="button" variant="secondary" onClick={() => {
                    onChooseDate(nextDate);
                    focusTimes();
                  }}>
                  Voir le {formatLongDate(nextDate)}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-6 motion-safe:animate-[bz-rise_var(--bz-duration-state)_var(--bz-ease-out)_both]">
              {groupSlotsByPeriod(slots.slots).map((group) => (
                <section key={group.period} aria-labelledby={`booking-times-${group.period}`} className="flex flex-col gap-3">
                  <h4 id={`booking-times-${group.period}`} className="flex items-center gap-2.5 after:h-px after:flex-1 after:bg-border/70">
                    <span className="type-label">{group.period}</span>
                    <span className="type-meta text-foreground/55">
                      {group.slots.length} horaire{group.slots.length > 1 ? "s" : ""}
                    </span>
                  </h4>
                  <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-2.5 lg:grid-cols-6">
                    {group.slots.map((candidate) => {
                      const selected = candidate.startsAt === slot?.startsAt;
                      const end = formatTimeInZone(candidate.endsAt, timeZone);
                      return (
                        <li key={candidate.startsAt}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            aria-label={end ? `De ${candidate.localTime} à ${end}` : candidate.localTime}
                            onClick={() => onChooseSlot(candidate)}
                            className={cn(
                              "type-figure flex min-h-11 w-full items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow] duration-[var(--bz-duration-state)]",
                              selected
                                ? "border-accent bg-accent text-white shadow-raised"
                                : "border-lavender-200 bg-lavender-25 text-lavender-700 hover:bg-lavender-50",
                            )}
                          >
                            <time dateTime={candidate.startsAt}>{candidate.localTime}</time>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="type-meta flex items-start gap-2 text-foreground/60">
            <ClockIcon size={16} className="mt-0.5 shrink-0 text-lavender-700" />
            Un horaire n’est réservé qu’une fois votre rendez-vous confirmé.
          </p>
        </div>
        </>
        )}

        <Button type="button" variant="ghost" onClick={onBack} className="self-start lg:hidden">
          Retour
        </Button>

        {/* Phone: the selection and « Continuer » follow the reader, then dock at the end of the step —
            never when no date can offer the selection. */}
        <div data-sticky-cta="" className={cn("sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 lg:hidden", cannotFit && "hidden")}>
          <div className="flex items-center gap-3 rounded-[1.5rem] bg-background py-2.5 pl-5 pr-2.5 shadow-[0_0_0_1px_rgb(223_222_228_/_0.7),0_12px_32px_rgba(31,28,61,0.14)]">
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="type-subtitle truncate">{selection ?? "Choisissez un horaire"}</p>
              <p className="type-meta truncate text-foreground/60">
                {what} · {formatDuration(minutes)}
              </p>
            </div>
            <Button type="button" size="lg" disabled={slot === undefined} onClick={onContinue}>
              Continuer
            </Button>
          </div>
        </div>
      </section>

      <AppointmentSummary
        services={services}
        durationMinutes={minutes}
        showPrices={selectionMode}
        professional={professional}
        date={date}
        slot={slot}
        timeZone={timeZone}
        className="hidden lg:flex"
      >
        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" disabled={slot === undefined} onClick={onContinue} className="w-full">
            Continuer
          </Button>
          <Button type="button" variant="ghost" onClick={onBack} className="w-full">
            Retour
          </Button>
        </div>
      </AppointmentSummary>
    </div>
  );
}

/**
 * A selection no date can offer — said once, with the way out (change the
 * selection), instead of letting her search through empty days.
 */
function CannotFit({
  view,
  professional,
  onChangeService,
}: {
  view: Extract<SlotsView, { status: "too_long" | "does_not_fit" }>;
  professional?: Professional;
  onChangeService: () => void;
}) {
  // « chez <nom> » reads naturally whatever the name (no elision to guess); without one, no name at all.
  const where = professional !== undefined ? `chez ${professional.name}, ` : "";
  return (
    <div role="alert" className="flex flex-col items-start gap-3.5 rounded-[1.4rem] bg-lavender-25 p-5 ring-1 ring-inset ring-lavender-100 sm:p-6">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-background text-lavender-700 shadow-card">
        <ClockIcon size={22} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="type-subtitle">
          {view.status === "too_long" ? "Votre sélection dépasse 12 h." : "Votre sélection est trop longue pour un seul rendez-vous."}
        </p>
        <p className={quiet}>
          {view.status === "too_long"
            ? `Elle dure ${formatDuration(view.durationMinutes)}, au-delà de la durée maximale d’un rendez-vous en ligne.`
            : `Elle dure ${formatDuration(view.durationMinutes)}, alors que ${where}les plages d’ouverture durent au plus ${formatDuration(view.longestIntervalMinutes)}.`}{" "}
          Retirez une ou plusieurs prestations pour trouver un horaire.
        </p>
      </div>
      <Button type="button" variant="secondary" onClick={onChangeService}>
        Modifier ma sélection
      </Button>
      {professional ? <ContactLinks professional={professional} /> : null}
    </div>
  );
}

/** The skeleton draws the day as two parts, as the times will be grouped. */
function splitForSkeleton(count: number): number[] {
  const first = Math.max(3, Math.round(count * 0.4));
  return [first, Math.max(3, count - first)];
}

/**
 * What is being booked, as the customer has chosen it so far — a sticky card
 * beside the step on a desktop (date and time, details). With several
 * services: each one in her order with its length and price, the combined
 * length and the indicative total (`showPrices`).
 */
export function AppointmentSummary({
  services,
  durationMinutes,
  showPrices = false,
  professional,
  date,
  slot,
  timeZone,
  className,
  children,
}: {
  services: readonly BookableService[];
  durationMinutes?: number;
  showPrices?: boolean;
  professional?: Professional;
  date?: string;
  slot?: AvailableSlot;
  timeZone: string;
  className?: string;
  children?: ReactNode;
}) {
  const single = services.length === 1 && !showPrices ? services[0] : undefined;
  return (
    <aside
      aria-labelledby="booking-summary-title"
      className={cn(
        "sticky top-6 flex-col gap-5 rounded-[1.75rem] bg-[linear-gradient(180deg,var(--bz-lavender-50)_0%,#fff_120px)] p-7 shadow-lifted ring-1 ring-border/60",
        className,
      )}
    >
      <h2 id="booking-summary-title" className="type-caption uppercase tracking-[0.12em] text-lavender-700">
        Votre rendez-vous
      </h2>
      <dl className="flex flex-col">
        {single !== undefined ? (
          <SummaryLine icon={<CheckIcon size={17} />} label="Prestation">
            <strong className="font-semibold">{single.name}</strong> · {formatDuration(single.durationMinutes)}
          </SummaryLine>
        ) : (
          <SummaryLine icon={<CheckIcon size={17} />} label={services.length > 1 ? `Prestations (${services.length})` : "Prestation"}>
            <SelectedServicesList services={services} showPrices={showPrices} className="pt-1.5" />
            <SelectionTotals services={services} durationMinutes={durationMinutes} showPrices={showPrices} className="mt-3 border-t border-border/70 pt-3" />
            {showPrices ? <span className="type-meta mt-1.5 block text-foreground/55">{INDICATIVE_NOTE}</span> : null}
          </SummaryLine>
        )}
        {professional ? (
          <SummaryLine icon={<UserIcon size={17} />} label="Avec">
            <strong className="font-semibold">{professional.name}</strong>
          </SummaryLine>
        ) : null}
        {professional?.location ? <LocationSummaryLine location={professional.location} /> : null}
        <SummaryLine icon={<CalendarIcon size={17} />} label="Date et horaire">
          {date ? <span className={cn("block", slot ? "font-semibold" : "text-foreground/60")}>{capitalized(formatLongDate(date))}</span> : null}
          {slot ? (
            <span className="block tabular-nums">{formatTimeRange(slot.localTime, slot.endsAt, timeZone)}</span>
          ) : (
            <span className="block text-foreground/60">Choisissez un horaire</span>
          )}
        </SummaryLine>
      </dl>
      {children}
    </aside>
  );
}

/**
 * Phone and tablet: where the appointment takes place, under the heading of the
 * date step and of the details step — the very line the desktop summary holds
 * beside those steps, hidden from the desktop breakpoint up so it is never said
 * twice. Compact: no map, the published lines and « Itinéraire » only.
 */
function StepLocation({ location }: { location: LocationView }) {
  return (
    <dl data-location-summary={location.kind} className="rounded-[1.25rem] bg-lavender-25 px-4 pt-3.5 ring-1 ring-lavender-100 lg:hidden">
      <LocationSummaryLine location={location} />
    </dl>
  );
}

/**
 * Where the appointment takes place, as ONE line of a summary — what the page
 * publishes and nothing more (`LocationView`): « Adresse », its two lines and
 * « Itinéraire » (the visitor's own platform behaviour), or « Lieu » and the
 * city alone, without any link. A page without a location renders none.
 */
function LocationSummaryLine({ location }: { location: LocationView }) {
  return (
    <SummaryLine icon={<PinIcon size={17} />} label={location.kind === "address" ? "Adresse" : "Lieu"}>
      <LocationLines location={location} />
    </SummaryLine>
  );
}

function SummaryLine({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 border-t border-border/70 py-3.5 first:border-t-0 first:pt-0">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-lavender-50 text-lavender-700">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="type-meta text-foreground/60">{label}</dt>
        <dd className="type-body-small min-w-0 [overflow-wrap:anywhere]">{children}</dd>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Details
// ---------------------------------------------------------------------------
const FIELD_COPY: Readonly<
  Record<CustomerField, { label: string; autoComplete: string; type: string; inputMode?: "email" | "tel"; maxLength: number; hint?: string }>
> = {
  firstName: { label: "Prénom", autoComplete: "given-name", type: "text", maxLength: 160 },
  lastName: { label: "Nom", autoComplete: "family-name", type: "text", maxLength: 160 },
  email: { label: "E-mail", autoComplete: "email", type: "email", inputMode: "email", maxLength: 320 },
  phone: { label: "Téléphone", autoComplete: "tel", type: "tel", inputMode: "tel", maxLength: 40, hint: "Par exemple 06 12 34 56 78" },
};

export function fieldMessage(field: CustomerField, issue: FieldIssue): string {
  if (issue === "required") {
    return {
      firstName: "Indiquez votre prénom.",
      lastName: "Indiquez votre nom.",
      email: "Indiquez votre adresse e-mail.",
      phone: "Indiquez votre numéro de téléphone.",
    }[field];
  }
  if (issue === "too_long") {
    return field === "email" ? "Cette adresse e-mail est trop longue." : field === "phone" ? "Ce numéro est trop long." : "80 caractères au maximum.";
  }
  return {
    firstName: "Ce prénom contient des caractères qui ne sont pas acceptés.",
    lastName: "Ce nom contient des caractères qui ne sont pas acceptés.",
    email: "Vérifiez votre adresse e-mail (par exemple nom@exemple.fr).",
    phone: "Vérifiez votre numéro de téléphone (par exemple 06 12 34 56 78 ou +33 6 12 34 56 78).",
  }[field];
}

export function DetailsStep({
  details,
  issues,
  professional,
  onEdit,
  onBack,
  onContinue,
  headingRef,
  fieldRefs,
}: {
  details: CustomerDetails;
  issues: Partial<Record<CustomerField, FieldIssue>>;
  professional: Professional;
  onEdit: (field: CustomerField, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
  fieldRefs?: Partial<Record<CustomerField, Ref<HTMLInputElement>>>;
}) {
  return (
    <section aria-labelledby="booking-step-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <StepHeading headingRef={headingRef}>Vos coordonnées</StepHeading>
        <p className="type-body-small text-foreground/75">
          Pas besoin de compte. Tous les champs sont obligatoires ; vos coordonnées sont transmises à {professional.name} pour
          ce rendez-vous.
        </p>
      </div>
      {professional.location ? <StepLocation location={professional.location} /> : null}
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          onContinue();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {(["firstName", "lastName", "email", "phone"] as const).map((field) => {
            const copy = FIELD_COPY[field];
            const issue = issues[field];
            const id = `booking-${field}`;
            const describedBy = [copy.hint ? `${id}-hint` : undefined, issue ? `${id}-error` : undefined].filter(Boolean).join(" ");
            return (
              <div key={field} className={cn("flex flex-col gap-2", field === "email" || field === "phone" ? "sm:col-span-2" : undefined)}>
                <label htmlFor={id} className="type-label">
                  {copy.label}
                </label>
                <input
                  ref={fieldRefs?.[field]}
                  id={id}
                  name={field}
                  type={copy.type}
                  inputMode={copy.inputMode}
                  autoComplete={copy.autoComplete}
                  autoCapitalize={field === "email" ? "none" : field === "phone" ? undefined : "words"}
                  spellCheck={false}
                  required
                  maxLength={copy.maxLength}
                  value={details[field]}
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={describedBy || undefined}
                  onChange={(event) => onEdit(field, event.target.value)}
                  className={cn(
                    "type-body min-h-12 w-full rounded-[0.875rem] border bg-background px-4 py-2 text-foreground transition-colors",
                    issue ? "border-danger" : "border-border focus-visible:border-accent",
                  )}
                />
                {copy.hint ? (
                  <p id={`${id}-hint`} className="type-meta text-foreground/65">
                    {copy.hint}
                  </p>
                ) : null}
                {issue ? (
                  <p id={`${id}-error`} className="type-body-small text-danger">
                    {fieldMessage(field, issue)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <Actions>
          <Button type="button" variant="ghost" onClick={onBack}>
            Retour
          </Button>
          <Button type="submit" size="lg">
            Continuer
          </Button>
        </Actions>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4. Review
// ---------------------------------------------------------------------------
function SummaryRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/70 py-4 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <dt className="type-meta text-foreground/65">{label}</dt>
        <dd className="type-body min-w-0 [overflow-wrap:anywhere]">{children}</dd>
      </div>
      {action}
    </div>
  );
}

/**
 * « Modifier » beside a line of the review: available; disabled in place
 * while a request is in flight (nothing moves, nothing can be changed); gone
 * once the request is frozen after an unknown outcome.
 */
function EditButton({ label, onClick, state }: { label: string; onClick: () => void; state: "enabled" | "busy" | "hidden" }) {
  if (state === "hidden") return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "busy"}
      className={cn(link, "type-body-small min-h-11 shrink-0 disabled:cursor-default disabled:opacity-40")}
      aria-label={label}
    >
      Modifier
    </button>
  );
}

export function ReviewStep({
  services,
  durationMinutes,
  selectionMode = false,
  date,
  slot,
  timeZone,
  details,
  professional,
  notice,
  sending,
  retrying,
  locked,
  challenge,
  challengeSlot,
  onEdit,
  onBack,
  onConfirm,
  onRetryChallenge,
  slow = false,
  headingRef,
}: {
  /** What is confirmed, in order: in the selection mode, the server's reading of it (its fingerprint is sent). */
  services: readonly BookableService[];
  /** The server's combined length. */
  durationMinutes?: number;
  /** Several services per booking: each with its price, the combined length and the indicative total. */
  selectionMode?: boolean;
  date: string;
  slot: AvailableSlot;
  timeZone: string;
  details: CustomerDetails;
  professional: Professional;
  notice?: FlowNotice;
  sending: boolean;
  /** A pending attempt: the button sends the same request again. */
  retrying: boolean;
  /** Frozen after an unknown outcome: nothing can be changed. */
  locked: boolean;
  /** The security check: confirming waits for a fresh token. */
  challenge: ChallengeState;
  /** The check's widget, rendered by the flow; invisible unless Cloudflare asks for an interaction. */
  challengeSlot?: ReactNode;
  onEdit: (step: "service" | "slot" | "details") => void;
  onBack: () => void;
  onConfirm: () => void;
  onRetryChallenge: () => void;
  /** The request has been in flight for a while: say it is still on its way. */
  slow?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const verified = challenge.status === "ready";
  const editState = sending ? "busy" : locked ? "hidden" : "enabled";
  return (
    <section aria-labelledby="booking-step-heading" className="flex flex-col gap-6">
      <StepHeading headingRef={headingRef}>Vérifiez votre rendez-vous</StepHeading>
      <dl className="rounded-[1.5rem] border border-border/80 bg-background px-5 py-5 sm:px-7">
        {selectionMode ? (
          <SummaryRow
            label={services.length > 1 ? `Vos prestations (${services.length})` : "Votre prestation"}
            action={<EditButton label="Modifier vos prestations" state={editState} onClick={() => onEdit("service")} />}
          >
            <SelectedServicesList services={services} className="pt-2" />
            <SelectionTotals services={services} durationMinutes={durationMinutes} className="mt-4 border-t border-border/70 pt-3" />
            <span className="type-meta mt-1.5 block text-foreground/55">{INDICATIVE_NOTE}</span>
          </SummaryRow>
        ) : (
          <SummaryRow
            label="Prestation"
            action={<EditButton label="Modifier la prestation" state={editState} onClick={() => onEdit("service")} />}
          >
            {services[0]?.name}{" "}
            <span className="text-foreground/65 tabular-nums">· {formatDuration(services[0]?.durationMinutes ?? 0)}</span>
          </SummaryRow>
        )}
        <SummaryRow label="Date et horaire" action={<EditButton label="Modifier la date et l’horaire" state={editState} onClick={() => onEdit("slot")} />}>
          {capitalized(formatLongDate(date))}
          <span className="block tabular-nums">{formatTimeRange(slot.localTime, slot.endsAt, timeZone)}</span>
          <span className="type-body-small block text-foreground/65">Horaires {describeTimeZone(timeZone)}</span>
        </SummaryRow>
        <SummaryRow label="Avec">{professional.name}</SummaryRow>
        {professional.location ? (
          <SummaryRow label={professional.location.kind === "address" ? "Adresse" : "Lieu"}>
            <LocationLines location={professional.location} />
          </SummaryRow>
        ) : null}
        <SummaryRow label="Vos coordonnées" action={<EditButton label="Modifier vos coordonnées" state={editState} onClick={() => onEdit("details")} />}>
          {details.firstName} {details.lastName}
          <span className="type-body-small block text-foreground/65">{details.email}</span>
          <span className="type-body-small block text-foreground/65 tabular-nums">{details.phone}</span>
        </SummaryRow>
      </dl>

      {notice ? <FlowNoticeBox notice={notice} professional={professional} /> : null}

      <p className={quiet}>
        En confirmant, vous réservez ce créneau auprès de {professional.name}
        {selectionMode && services.length > 1 ? `, pour vos ${services.length} prestations à la suite` : ""}. Vos coordonnées lui
        sont transmises pour ce rendez-vous.{selectionMode ? " Aucun paiement n’est demandé en ligne." : ""}
      </p>

      <div className="flex min-w-0 flex-col gap-3">
        {challengeSlot}
        {/* One line of fixed height in every state: the confirmation button never jumps. */}
        <div className="flex min-h-6 items-center gap-2 text-foreground/70">
          {sending ? null : (
            <>
              {challenge.status === "checking" ? <Spinner size={14} className="text-lavender-700" /> : null}
              <ChallengeStatus challenge={challenge} professional={professional} onRetry={onRetryChallenge} />
            </>
          )}
        </div>
      </div>

      <Actions>
        {locked ? <span /> : (
          <Button type="button" variant="ghost" onClick={onBack}>
            Retour
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          className="busy-glyph sm:min-w-[15.5rem]"
          onClick={onConfirm}
          disabled={sending || !verified}
          aria-busy={sending || undefined}
          aria-describedby={sending || verified ? undefined : CHALLENGE_STATUS_ID}
        >
          {sending ? "Réservation en cours…" : retrying ? "Réessayer" : "Confirmer le rendez-vous"}
        </Button>
      </Actions>
      {sending && slow ? (
        <p role="status" className={cn(quiet, "-mt-2 sm:text-right")}>
          Cela prend un peu plus de temps que prévu. Ne fermez pas cette page : votre demande est toujours en cours.
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The outcome
// ---------------------------------------------------------------------------
export function BookingConfirmation({
  booking,
  professional,
  profileHref,
  onRestart,
  headingRef,
}: {
  booking: ConfirmedBooking;
  professional: Professional;
  profileHref: string;
  onRestart?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <section aria-labelledby="booking-step-heading" className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-[1.75rem] bg-mint-50 p-6 motion-safe:animate-[bz-rise_var(--bz-duration-enter)_var(--bz-ease-emphasized)_both] sm:p-8">
        <StepHeading headingRef={headingRef}>
          {/* « rendez-vous » never breaks at its hyphen. */}
          Votre <span className="whitespace-nowrap">rendez-vous</span> est réservé.
        </StepHeading>
        <p className="type-body text-foreground/80">
          {professional.name} vous attend le {formatLongDate(booking.localDate)} à{" "}
          <span className="tabular-nums">{booking.localTime}</span>
          {booking.services.length > 1 ? (
            <>
              {" "}
              pour vos {booking.services.length} prestations, soit{" "}
              <span className="tabular-nums">{formatDuration(booking.durationMinutes)}</span> en tout
            </>
          ) : null}
          .
        </p>
      </div>

      <dl className="rounded-[1.5rem] border border-border/80 bg-background px-5 py-5 sm:px-7">
        <SummaryRow label="Référence">
          <span className="type-figure break-all">{booking.reference}</span>
        </SummaryRow>
        {booking.services.length === 1 ? (
          <SummaryRow label="Prestation">
            {booking.services[0]!.name}{" "}
            <span className="text-foreground/65 tabular-nums">· {formatDuration(booking.services[0]!.durationMinutes)}</span>
          </SummaryRow>
        ) : (
          <SummaryRow label={`Prestations (${booking.services.length})`}>
            <SelectedServicesList services={booking.services} showPrices={false} className="pt-2" />
            <span className="type-body-small mt-3 flex items-baseline justify-between gap-4 border-t border-border/70 pt-3">
              <span className="text-foreground/70">Durée totale</span>
              <span className="type-label tabular-nums">{formatDuration(booking.durationMinutes)}</span>
            </span>
          </SummaryRow>
        )}
        <SummaryRow label="Date">{capitalized(formatLongDate(booking.localDate))}</SummaryRow>
        <SummaryRow label="Horaire">
          <span className="tabular-nums">{formatTimeRange(booking.localTime, booking.endsAt, booking.timeZone)}</span>
          <span className="type-body-small block text-foreground/65">Horaires {describeTimeZone(booking.timeZone)}</span>
        </SummaryRow>
        <SummaryRow label="Avec">{professional.name}</SummaryRow>
      </dl>

      {/* Where to go — exactly what her page publishes: an address with its directions, a city, or nothing. */}
      {professional.location ? (
        <LocationPanel location={professional.location} professionalName={professional.name} headingId="booking-location-heading" />
      ) : null}

      <div className="flex flex-col gap-2">
        <p className={quiet}>
          Aucun e-mail de confirmation n’est envoyé pour le moment : conservez ces informations (une capture d’écran
          suffit). Pour modifier ou annuler ce rendez-vous, contactez {professional.name}.
          {/* Her page shows no place: the customer is pointed to her, never to a location. */}
          {professional.location ? "" : ` Pour connaître le lieu du rendez-vous, contactez ${professional.name}.`}
          {booking.kind === "selection" ? " Aucun paiement n’a été effectué en ligne." : ""}
        </p>
        <ContactLinks professional={professional} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="secondary">
          <a href={profileHref}>Retour à la page de {professional.name}</a>
        </Button>
        {onRestart ? (
          <Button type="button" variant="ghost" onClick={onRestart}>
            Prendre un autre rendez-vous
          </Button>
        ) : null}
      </div>
    </section>
  );
}
