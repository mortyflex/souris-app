import type { ReactNode, Ref } from "react";

import { Button } from "@/components/ui/button";
import {
  datesOfWindow,
  describeTimeZone,
  formatDuration,
  formatLongDate,
  formatShortDate,
  type AvailableSlot,
  type BookableService,
} from "@/features/availability/availability";
import type { ConfirmedBooking } from "@/features/booking/booking-answer";
import type { FlowNotice } from "@/features/booking/booking-flow";
import type { CustomerDetails, CustomerField, FieldIssue } from "@/features/booking/booking-request";
import { formatTimeInZone, formatTimeRange } from "@/features/booking/local-time";
import { cn } from "@/lib/utils";

/**
 * The screens of the public booking flow — presentation only. State, network
 * and history live in `booking-flow.tsx`; every rule lives in
 * `src/features/booking/`. Nothing here computes a time: starts are the
 * server's labels, ends are formatted in the professional's time zone.
 */

export interface Professional {
  readonly name: string;
  readonly address?: string;
  readonly phone?: string;
  readonly email?: string;
}

const choice =
  "rounded-[1.25rem] border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const chosen = "border-accent bg-lavender-50 text-lavender-700";
const notChosen = "border-border bg-background hover:bg-lavender-25";
const quiet = "type-body-small text-foreground/70";
const link =
  "font-medium text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700";

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

export function noticeCopy(notice: FlowNotice, professionalName: string): NoticeCopy {
  switch (notice) {
    case "SLOT_TAKEN":
      return {
        tone: "danger",
        title: "Ce créneau vient d’être réservé.",
        body: "Choisissez un autre horaire : vos coordonnées sont conservées.",
      };
    case "SERVICE_GONE":
      return { tone: "danger", title: "Cette prestation n’est plus proposée en ligne.", body: "Choisissez une autre prestation." };
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

export function FlowNoticeBox({ notice, professional }: { notice: FlowNotice; professional: Professional }) {
  const copy = noticeCopy(notice, professional.name);
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
      {copy.contact ? <ContactLinks professional={professional} /> : null}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">{children}</div>;
}

// ---------------------------------------------------------------------------
// 1. Service
// ---------------------------------------------------------------------------
export function ServiceStep({
  services,
  selectedId,
  loading,
  onChoose,
  headingRef,
  professional,
}: {
  services: readonly BookableService[];
  selectedId?: string;
  loading?: boolean;
  onChoose: (service: BookableService) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  professional: Professional;
}) {
  return (
    <section aria-labelledby="booking-step-heading" className="flex flex-col gap-5">
      <StepHeading headingRef={headingRef}>Choisissez une prestation</StepHeading>
      {services.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-[1.25rem] bg-surface px-5 py-4">
          <p className="type-subtitle">Aucune prestation n’est proposée en ligne pour le moment.</p>
          <p className={quiet}>Vous pouvez contacter {professional.name} directement.</p>
          <ContactLinks professional={professional} />
        </div>
      ) : (
        <ul aria-busy={loading || undefined} className="grid gap-3 sm:grid-cols-2">
          {services.map((service) => {
            const selected = service.id === selectedId;
            return (
              <li key={service.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  disabled={loading}
                  onClick={() => onChoose(service)}
                  className={cn(choice, "flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4", selected ? chosen : notChosen)}
                >
                  <span className="type-subtitle min-w-0 [overflow-wrap:anywhere]">{service.name}</span>
                  <span className="type-meta shrink-0 tabular-nums text-foreground/70">{formatDuration(service.durationMinutes)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
  | { readonly status: "ready"; readonly slots: readonly AvailableSlot[] };

export function SlotStep({
  service,
  window,
  date,
  slot,
  slots,
  timeZone,
  onChangeService,
  onChooseDate,
  onChooseSlot,
  onRetry,
  onBack,
  onContinue,
  headingRef,
}: {
  service: BookableService;
  window: { readonly firstDate: string; readonly lastDate: string };
  date?: string;
  slot?: AvailableSlot;
  slots: SlotsView;
  timeZone: string;
  onChangeService: () => void;
  onChooseDate: (date: string) => void;
  onChooseSlot: (slot: AvailableSlot) => void;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const dates = datesOfWindow(window.firstDate, window.lastDate);
  const nextDate = date === undefined ? undefined : dates[dates.indexOf(date) + 1];
  return (
    <section aria-labelledby="booking-step-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StepHeading headingRef={headingRef}>Choisissez une date et un horaire</StepHeading>
        <p className="type-body-small flex flex-wrap items-center gap-x-3 text-foreground/75">
          <span>
            {service.name} · <span className="tabular-nums">{formatDuration(service.durationMinutes)}</span>
          </span>
          <button type="button" onClick={onChangeService} className={cn(link, "min-h-11")}>
            Changer de prestation
          </button>
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 id="booking-dates" className="type-label">
          Date
        </h3>
        <ul aria-labelledby="booking-dates" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {dates.map((candidate) => {
            const selected = candidate === date;
            return (
              <li key={candidate} className="shrink-0 snap-start">
                <button
                  type="button"
                  id={`booking-date-${candidate}`}
                  aria-pressed={selected}
                  aria-label={capitalized(formatLongDate(candidate))}
                  onClick={() => onChooseDate(candidate)}
                  className={cn(choice, "type-label flex min-h-11 items-center whitespace-nowrap px-4 py-2 tabular-nums", selected ? chosen : notChosen)}
                >
                  {formatShortDate(candidate)}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3 id="booking-times" className="type-label">
          {date ? `Horaires du ${formatLongDate(date)}` : "Horaires"}
        </h3>
        {slots.status === "loading" ? (
          <div aria-busy="true" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <span className="sr-only">Chargement des horaires…</span>
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-full bg-lavender-50" />
            ))}
          </div>
        ) : slots.status === "error" ? (
          <div className="flex flex-col items-start gap-3 rounded-[1.25rem] bg-danger-surface px-5 py-4 text-danger" role="alert">
            <p className="type-subtitle">Les horaires n’ont pas pu être chargés.</p>
            <Button type="button" variant="secondary" onClick={onRetry}>
              Réessayer
            </Button>
          </div>
        ) : slots.status === "limited" ? (
          <div className="flex flex-col items-start gap-3 rounded-[1.25rem] bg-surface px-5 py-4" role="status">
            <p className="type-subtitle">Trop de demandes depuis votre connexion.</p>
            <p className={quiet}>Patientez quelques minutes, puis réessayez.</p>
            <Button type="button" variant="secondary" onClick={onRetry}>
              Réessayer
            </Button>
          </div>
        ) : slots.status === "out_of_window" ? (
          <div className="rounded-[1.25rem] bg-surface px-5 py-4" role="status">
            <p className="type-subtitle">Cette date n’est plus ouverte à la réservation.</p>
            <p className={quiet}>Choisissez une autre date.</p>
          </div>
        ) : slots.slots.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-[1.25rem] bg-surface px-5 py-4" role="status">
            <p className="type-subtitle">Aucun horaire disponible ce jour-là.</p>
            {nextDate ? (
              <Button type="button" variant="secondary" onClick={() => onChooseDate(nextDate)}>
                Voir le {formatLongDate(nextDate)}
              </Button>
            ) : (
              <p className={quiet}>Essayez une autre date.</p>
            )}
          </div>
        ) : (
          <ul aria-labelledby="booking-times" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {slots.slots.map((candidate) => {
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
                      "type-figure flex min-h-11 w-full items-center justify-center rounded-full border transition-colors",
                      selected ? "border-accent bg-accent text-white" : "border-lavender-200 bg-lavender-25 text-lavender-700 hover:bg-lavender-50",
                    )}
                  >
                    <time dateTime={candidate.startsAt}>{candidate.localTime}</time>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className={quiet}>
          Horaires {describeTimeZone(timeZone)}. Un horaire n’est réservé qu’une fois votre rendez-vous confirmé.
        </p>
      </div>

      <Actions>
        <Button type="button" variant="ghost" onClick={onBack}>
          Retour
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          {slot && date ? (
            <p className="type-body-small text-foreground/75" aria-live="polite">
              {capitalized(formatLongDate(date))} à <span className="tabular-nums">{slot.localTime}</span>
            </p>
          ) : null}
          <Button type="button" size="lg" disabled={slot === undefined} onClick={onContinue}>
            Continuer
          </Button>
        </div>
      </Actions>
    </section>
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
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="type-meta text-foreground/65">{label}</dt>
        <dd className="type-body min-w-0 [overflow-wrap:anywhere]">{children}</dd>
      </div>
      {action}
    </div>
  );
}

function EditButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  if (disabled) return null;
  return (
    <button type="button" onClick={onClick} className={cn(link, "type-body-small min-h-11 shrink-0")} aria-label={label}>
      Modifier
    </button>
  );
}

export function ReviewStep({
  service,
  date,
  slot,
  timeZone,
  details,
  professional,
  notice,
  sending,
  retrying,
  locked,
  onEdit,
  onBack,
  onConfirm,
  headingRef,
}: {
  service: BookableService;
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
  onEdit: (step: "service" | "slot" | "details") => void;
  onBack: () => void;
  onConfirm: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <section aria-labelledby="booking-step-heading" className="flex flex-col gap-6">
      <StepHeading headingRef={headingRef}>Vérifiez votre rendez-vous</StepHeading>
      <dl className="rounded-[1.5rem] border border-border/80 bg-background px-5 py-5 sm:px-7">
        <SummaryRow
          label="Prestation"
          action={<EditButton label="Modifier la prestation" disabled={locked} onClick={() => onEdit("service")} />}
        >
          {service.name} <span className="text-foreground/65 tabular-nums">· {formatDuration(service.durationMinutes)}</span>
        </SummaryRow>
        <SummaryRow label="Date et horaire" action={<EditButton label="Modifier la date et l’horaire" disabled={locked} onClick={() => onEdit("slot")} />}>
          {capitalized(formatLongDate(date))}
          <span className="block tabular-nums">{formatTimeRange(slot.localTime, slot.endsAt, timeZone)}</span>
          <span className="type-body-small block text-foreground/65">Horaires {describeTimeZone(timeZone)}</span>
        </SummaryRow>
        <SummaryRow label="Avec">
          {professional.name}
          {professional.address ? (
            <span className="type-body-small block whitespace-pre-line text-foreground/65">{professional.address}</span>
          ) : null}
        </SummaryRow>
        <SummaryRow label="Vos coordonnées" action={<EditButton label="Modifier vos coordonnées" disabled={locked} onClick={() => onEdit("details")} />}>
          {details.firstName} {details.lastName}
          <span className="type-body-small block text-foreground/65">{details.email}</span>
          <span className="type-body-small block text-foreground/65 tabular-nums">{details.phone}</span>
        </SummaryRow>
      </dl>

      {notice ? <FlowNoticeBox notice={notice} professional={professional} /> : null}

      <p className={quiet}>
        En confirmant, vous réservez ce créneau auprès de {professional.name}. Vos coordonnées lui sont transmises pour ce
        rendez-vous.
      </p>

      <Actions>
        {locked ? <span /> : (
          <Button type="button" variant="ghost" onClick={onBack}>
            Retour
          </Button>
        )}
        <Button type="button" size="lg" onClick={onConfirm} disabled={sending} aria-busy={sending || undefined}>
          {sending ? "Réservation en cours…" : retrying ? "Réessayer" : "Confirmer le rendez-vous"}
        </Button>
      </Actions>
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
      <div className="flex flex-col items-start gap-3 rounded-[1.75rem] bg-mint-50 p-6 sm:p-8">
        <StepHeading headingRef={headingRef}>Votre rendez-vous est réservé.</StepHeading>
        <p className="type-body text-foreground/80">
          {professional.name} vous attend le {formatLongDate(booking.localDate)} à{" "}
          <span className="tabular-nums">{booking.localTime}</span>.
        </p>
      </div>

      <dl className="rounded-[1.5rem] border border-border/80 bg-background px-5 py-5 sm:px-7">
        <SummaryRow label="Référence">
          <span className="type-figure break-all">{booking.reference}</span>
        </SummaryRow>
        <SummaryRow label="Prestation">
          {booking.service.name}{" "}
          <span className="text-foreground/65 tabular-nums">· {formatDuration(booking.service.durationMinutes)}</span>
        </SummaryRow>
        <SummaryRow label="Date">{capitalized(formatLongDate(booking.localDate))}</SummaryRow>
        <SummaryRow label="Horaire">
          <span className="tabular-nums">{formatTimeRange(booking.localTime, booking.endsAt, booking.timeZone)}</span>
          <span className="type-body-small block text-foreground/65">Horaires {describeTimeZone(booking.timeZone)}</span>
        </SummaryRow>
        <SummaryRow label="Avec">
          {professional.name}
          {professional.address ? (
            <span className="type-body-small block whitespace-pre-line text-foreground/65">{professional.address}</span>
          ) : null}
        </SummaryRow>
      </dl>

      <div className="flex flex-col gap-2">
        <p className={quiet}>
          Aucun e-mail de confirmation n’est envoyé pour le moment : conservez ces informations (une capture d’écran
          suffit). Pour modifier ou annuler ce rendez-vous, contactez {professional.name}.
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
