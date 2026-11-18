import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { formatDuration, type BookableService } from "@/features/availability/availability";
import {
  changedPriceLabel,
  formatSelectionTotal,
  formatServiceCount,
  MAX_SELECTED_SERVICES,
  MAX_SELECTION_MINUTES,
  priceLabel,
  summarizeSelection,
  type ServiceChange,
} from "@/features/availability/selection";
import { cn } from "@/lib/utils";

/**
 * The customer's selection, as she reads it everywhere in the flow — in HER
 * order, each service with its length and its price (the server's, « Tarif à
 * confirmer » for 0, nothing when unknown), the combined length, and the
 * indicative total only when every price is known and positive (« Total à
 * confirmer » otherwise). Never an invented amount, never a payment: the page
 * takes none. Presentation only.
 */

/** Said once wherever a price or a total is shown. */
export const INDICATIVE_NOTE = "Tarifs indicatifs · aucun paiement en ligne.";
/** The id of the message saying the selection is full (« Ajouter » points to it). */
export const SELECTION_LIMIT_ID = "booking-selection-limit";

/** The selected services, numbered in her order. */
export function SelectedServicesList({
  services,
  showPrices = true,
  onRemove,
  disabled = false,
  className,
}: {
  services: readonly Pick<BookableService, "id" | "name" | "durationMinutes" | "priceCents">[];
  showPrices?: boolean;
  /** Offers « Retirer » on each line. */
  onRemove?: (serviceId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {services.map((service, index) => {
        const price = showPrices ? priceLabel(service) : undefined;
        return (
          <li key={service.id} className="flex items-start gap-3 border-t border-border/70 py-3 first:border-t-0 first:pt-0 last:pb-0">
            <span
              aria-hidden="true"
              className="type-meta mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-lavender-50 font-semibold tabular-nums text-lavender-700"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="type-body-small min-w-0 font-semibold [overflow-wrap:anywhere]">{service.name}</span>
              <span className="type-meta flex flex-wrap gap-x-2 text-foreground/65 tabular-nums">
                <span>{formatDuration(service.durationMinutes)}</span>
                {price !== undefined ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span data-price="">{price}</span>
                  </>
                ) : null}
              </span>
            </div>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(service.id)}
                disabled={disabled}
                aria-label={`Retirer ${service.name} de votre sélection`}
                className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-lavender-50 hover:text-foreground disabled:opacity-40"
              >
                <CloseIcon size={18} />
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** The combined length and the indicative total (or « Total à confirmer »). */
export function SelectionTotals({
  services,
  durationMinutes,
  showPrices = true,
  className,
}: {
  services: readonly BookableService[];
  /** The server's combined length when known; the sum of the services otherwise. */
  durationMinutes?: number;
  showPrices?: boolean;
  className?: string;
}) {
  const summary = summarizeSelection(services);
  const minutes = durationMinutes ?? summary.durationMinutes;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <dl className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="type-body-small text-foreground/70">Durée totale</dt>
          <dd className="type-label tabular-nums">{formatDuration(minutes)}</dd>
        </div>
        {showPrices && summary.price.kind === "total" ? (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="type-body-small text-foreground/70">Total indicatif</dt>
            <dd data-total="" className="type-label tabular-nums">
              {formatSelectionTotal(summary.price)}
            </dd>
          </div>
        ) : null}
      </dl>
      {showPrices && summary.price.kind === "to_confirm" ? (
        <p data-total="" className="type-body-small text-foreground/70">
          {formatSelectionTotal(summary.price)}
        </p>
      ) : null}
    </div>
  );
}

/** Why « Choisir un horaire » is not offered for a selection longer than 12 hours (the server checks it too). */
export function isSelectionTooLong(services: readonly BookableService[]): boolean {
  return summarizeSelection(services).durationMinutes > MAX_SELECTION_MINUTES;
}

/** The message shown when the selection is full: « Ajouter » points to it. */
export function SelectionLimitNote({ count, className }: { count: number; className?: string }) {
  if (count < MAX_SELECTED_SERVICES) return null;
  return (
    <p id={SELECTION_LIMIT_ID} role="status" className={cn("type-body-small rounded-[1rem] bg-surface px-4 py-3 text-foreground/80", className)}>
      Vous avez choisi {MAX_SELECTED_SERVICES} prestations, le maximum pour un même rendez-vous en ligne. Retirez-en une pour en
      ajouter une autre.
    </p>
  );
}

/**
 * The selection beside the services (a sticky card on a desktop; at the end of
 * the step on a phone): her services in order with « Retirer », the totals,
 * and « Choisir un horaire ».
 */
export function SelectionPanel({
  services,
  onRemove,
  onChooseTimes,
  disabled = false,
  className,
}: {
  services: readonly BookableService[];
  onRemove: (serviceId: string) => void;
  onChooseTimes: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const tooLong = isSelectionTooLong(services);
  return (
    <aside
      aria-labelledby="booking-selection-title"
      className={cn(
        "flex-col gap-5 rounded-[1.75rem] bg-[linear-gradient(180deg,var(--bz-lavender-50)_0%,#fff_120px)] p-6 shadow-lifted ring-1 ring-border/60 sm:p-7",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="booking-selection-title" className="type-caption uppercase tracking-[0.12em] text-lavender-700">
          Votre sélection
        </h2>
        {services.length > 0 ? (
          <span className="type-meta tabular-nums text-foreground/60">
            {services.length} / {MAX_SELECTED_SERVICES}
          </span>
        ) : null}
      </div>
      {services.length === 0 ? (
        <p className="type-body-small text-foreground/70">
          Ajoutez une ou plusieurs prestations — jusqu’à {MAX_SELECTED_SERVICES} : elles s’enchaînent dans l’ordre où vous les
          ajoutez.
        </p>
      ) : (
        <>
          <SelectedServicesList services={services} onRemove={onRemove} disabled={disabled} />
          <div className="flex flex-col gap-2 border-t border-border/70 pt-4">
            <SelectionTotals services={services} />
            <p className="type-meta text-foreground/55">{INDICATIVE_NOTE}</p>
          </div>
        </>
      )}
      {tooLong ? <TooLongNote /> : null}
      <Button type="button" size="lg" disabled={disabled || services.length === 0 || tooLong} onClick={onChooseTimes} className="w-full">
        Choisir un horaire
      </Button>
    </aside>
  );
}

function TooLongNote() {
  return (
    <p role="status" className="type-body-small rounded-[1rem] bg-danger-surface px-4 py-3 text-danger">
      Votre sélection dépasse 12 h, la durée maximale d’un rendez-vous en ligne. Retirez une prestation pour choisir un horaire.
    </p>
  );
}

/**
 * Phone: what is selected follows the reader while she chooses — the count,
 * the combined length, the indicative total — with « Choisir un horaire »;
 * then it docks at the end of the step, so it never covers the page's footer.
 * Shown once at least one service is selected.
 */
export function SelectionStickyBar({
  services,
  onChooseTimes,
  disabled = false,
  className,
}: {
  services: readonly BookableService[];
  onChooseTimes: () => void;
  disabled?: boolean;
  className?: string;
}) {
  if (services.length === 0) return null;
  const summary = summarizeSelection(services);
  const tooLong = summary.durationMinutes > MAX_SELECTION_MINUTES;
  return (
    <div data-sticky-cta="" className={cn("sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20", className)}>
      {/* A narrow phone stacks the summary over a full-width button: nothing of it is ever cut. */}
      <div className="flex flex-col gap-2.5 rounded-[1.5rem] bg-background p-3 pl-4 shadow-[0_0_0_1px_rgb(223_222_228_/_0.7),0_12px_32px_rgba(31,28,61,0.14)] sm:flex-row sm:items-center sm:gap-3 sm:py-2.5 sm:pl-5 sm:pr-2.5">
        <div
          className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 sm:flex-col sm:flex-nowrap sm:items-start sm:gap-0"
          aria-live="polite"
        >
          <p className="type-subtitle min-w-0 tabular-nums sm:truncate">
            {formatServiceCount(summary.count)} · {formatDuration(summary.durationMinutes)}
          </p>
          <p className="type-meta shrink-0 tabular-nums text-foreground/60 sm:truncate">
            {tooLong ? "Plus de 12 h" : formatSelectionTotal(summary.price)}
          </p>
        </div>
        <Button type="button" size="lg" disabled={disabled || tooLong} onClick={onChooseTimes} className="w-full shrink-0 px-5 sm:w-auto">
          Choisir un horaire
        </Button>
      </div>
    </div>
  );
}

/** « Coupe : tarif 45 € → 50 €, durée 1 h → 1 h 15 » — one line per changed service. */
export function ChangesList({ changes }: { changes: readonly ServiceChange[] }): ReactNode {
  if (changes.length === 0) return null;
  return (
    <ul className="type-body-small flex flex-col gap-1">
      {changes.map((change) => {
        const parts: string[] = [];
        if (change.previousName !== undefined) parts.push(`anciennement « ${change.previousName} »`);
        if (change.price !== undefined) parts.push(`tarif ${changedPriceLabel(change.price.from)} → ${changedPriceLabel(change.price.to)}`);
        if (change.duration !== undefined) {
          parts.push(`durée ${formatDuration(change.duration.from)} → ${formatDuration(change.duration.to)}`);
        }
        return (
          <li key={change.id} className="[overflow-wrap:anywhere]">
            <strong className="font-semibold">{change.name}</strong> : {parts.join(", ")}
          </li>
        );
      })}
    </ul>
  );
}
