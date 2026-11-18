"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { CheckIcon, ChevronRightIcon, ClockIcon, CloseIcon, PlusIcon } from "@/components/ui/icons";
import { formatDuration, type BookableService } from "@/features/availability/availability";
import { formatServicePrice, isClamped, PRICE_TO_CONFIRM } from "@/features/availability/service-catalog";
import { cn } from "@/lib/utils";

import { ServiceDetailDialog } from "./service-detail-dialog";

/**
 * ONE bookable service, as a customer chooses it: its name, its duration, its
 * price (the server's — « Tarif à confirmer » for 0, nothing when the server
 * gave none), the first two lines of its description, and two DISTINCT
 * actions — never a button inside a button:
 *
 *   * « Choisir » selects the service (the flow then moves on);
 *   * « Voir le détail » opens the whole description in a dialog (a modal on
 *     a tablet or a desktop, a bottom sheet on a phone: ServiceDetailDialog),
 *     offered only when the two lines actually hide some of it.
 *
 * The card never grows: the description stays a two-line preview, so a long
 * one never makes a row of the grid tall; the cards of a row share its height
 * and their actions sit at the bottom, on one line. It is plain
 * text rendered as text (React escapes it; it is never interpreted as
 * markup); its line breaks are kept. It is clipped at two lines and, when some
 * of it is hidden, the end of the second line fades out — no ellipsis glyph,
 * so no « lumineux.… ». Without one, the card simply has none — no empty
 * placeholder. Opening and closing the detail changes nothing of the booking.
 *
 * When a booking holds several services (`selectionAction`), the action is
 * the only part that changes: « Ajouter » appends the service to the end of
 * the selection, a selected card shows its place in her order and offers
 * « Retirer »; when the selection is full (8), « Ajouter » is disabled and
 * points to the message that says why.
 */

export interface ServiceSelectionAction {
  /** Its place in her selection (1…8) when selected; absent when not. */
  readonly position?: number;
  /** One more service may be added (fewer than eight are selected). */
  readonly canAdd: boolean;
  /** The id of the message explaining why « Ajouter » is disabled. */
  readonly limitId?: string;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}

export interface ServiceCardProps {
  readonly service: BookableService;
  readonly selected: boolean;
  readonly disabled?: boolean;
  /** 3 for a plain list, 4 under a category heading. */
  readonly headingLevel: 3 | 4;
  readonly onChoose: () => void;
  /** Several services per booking: add / remove instead of « Choisir ». */
  readonly selectionAction?: ServiceSelectionAction;
}

export function ServiceCard(props: ServiceCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement>(null);

  // Measured on the two-line preview — and again whenever the card's width
  // changes (rotation, window resize). The observer's first callback runs
  // before the next paint, so the control never flickers in.
  useEffect(() => {
    const element = descriptionRef.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setTruncated(isClamped(element)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.service.description]);

  return (
    <>
      <ServiceCardView
        {...props}
        descriptionRef={descriptionRef}
        detailTriggerRef={detailTriggerRef}
        detailOpen={detailOpen}
        truncated={truncated}
        onOpenDetail={() => setDetailOpen(true)}
      />
      {detailOpen ? (
        <ServiceDetailDialog service={props.service} returnFocusRef={detailTriggerRef} onClosed={() => setDetailOpen(false)} />
      ) : null}
    </>
  );
}

export interface ServiceCardViewProps extends ServiceCardProps {
  /** The two lines hide part of the description (measured by `ServiceCard`). */
  readonly truncated: boolean;
  /** The detail dialog is open. */
  readonly detailOpen?: boolean;
  readonly onOpenDetail: () => void;
  readonly descriptionRef?: Ref<HTMLParagraphElement>;
  /** « Voir le détail »: the focus comes back to it when the dialog closes. */
  readonly detailTriggerRef?: Ref<HTMLButtonElement>;
}

/** The card itself, without state: what the two measured facts mean on screen. */
export function ServiceCardView({
  service,
  selected,
  disabled = false,
  headingLevel,
  onChoose,
  truncated,
  detailOpen = false,
  onOpenDetail,
  descriptionRef,
  detailTriggerRef,
  selectionAction,
}: ServiceCardViewProps) {
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const descriptionId = `${baseId}-description`;
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const price = formatServicePrice(service.priceCents);
  const offersDetail = service.description !== undefined && truncated;
  const position = selectionAction?.position;
  const highlighted = selectionAction === undefined ? selected : position !== undefined;

  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        "flex h-full flex-col gap-4 rounded-[1.4rem] border bg-background p-5 shadow-card transition-[border-color,box-shadow] duration-[var(--bz-duration-state)] sm:p-6",
        highlighted ? "border-accent ring-1 ring-accent/25" : "border-border/80",
      )}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <Heading id={nameId} className="type-subtitle min-w-0 [overflow-wrap:anywhere]">
            {service.name}
          </Heading>
          {position !== undefined ? (
            <span
              data-position=""
              className="type-meta grid size-7 shrink-0 place-items-center rounded-full bg-accent font-semibold tabular-nums text-white motion-safe:animate-[bz-rise_var(--bz-duration-state)_var(--bz-ease-out)_both]"
            >
              <span aria-hidden="true">{position}</span>
              <span className="sr-only">{ordinal(position)} prestation de votre sélection</span>
            </span>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="type-meta inline-flex items-center gap-1.5 rounded-full bg-lavender-50 px-2.5 py-1 tabular-nums text-lavender-700">
            <ClockIcon size={14} />
            {formatDuration(service.durationMinutes)}
          </span>
          {price !== undefined ? (
            <span
              data-price=""
              className={cn("tabular-nums", price === PRICE_TO_CONFIRM ? "type-meta text-foreground/65" : "type-label text-foreground")}
            >
              {price}
            </span>
          ) : null}
        </p>
      </div>

      {service.description !== undefined ? (
        <p
          ref={descriptionRef}
          id={descriptionId}
          data-preview=""
          className={cn(
            // Exactly two lines, clipped — never more in the card. Not `line-clamp`: its
            // built-in « … » landed after the period of a paragraph that ends the second
            // line (« lumineux.… »). A browser without the `lh` unit shows the whole text.
            "type-body-small relative max-h-[2lh] overflow-hidden whitespace-pre-line text-foreground/75 [overflow-wrap:anywhere]",
            // Some of it is hidden: the end of the second line fades out instead.
            truncated &&
              "after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:h-[1lh] after:w-16 after:bg-[linear-gradient(to_right,transparent,var(--color-background))]",
          )}
        >
          {service.description}
        </p>
      ) : null}

      {/* The actions stay on ONE row: the detail control appearing never moves the card. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {offersDetail ? (
          <button
            ref={detailTriggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={detailOpen}
            onClick={onOpenDetail}
            className="type-label inline-flex min-h-11 items-center gap-1 rounded-full text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Voir le détail
            <span className="sr-only"> de {service.name}</span>
            <ChevronRightIcon size={16} />
          </button>
        ) : null}
        {selectionAction === undefined ? (
          <Button
            type="button"
            variant={selected ? "primary" : "secondary"}
            aria-pressed={selected}
            disabled={disabled}
            onClick={onChoose}
            className="ml-auto"
          >
            {selected ? <CheckIcon size={16} /> : null}
            Choisir
            <span className="sr-only"> {service.name}</span>
          </Button>
        ) : position !== undefined ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="type-label inline-flex items-center gap-1.5 text-lavender-700">
              <CheckIcon size={16} />
              Ajoutée
            </span>
            <Button type="button" variant="ghost" disabled={disabled} onClick={selectionAction.onRemove} className="px-3.5">
              <CloseIcon size={16} />
              Retirer
              <span className="sr-only"> {service.name} de votre sélection</span>
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !selectionAction.canAdd}
            aria-describedby={!selectionAction.canAdd ? selectionAction.limitId : undefined}
            onClick={selectionAction.onAdd}
            className="ml-auto"
          >
            <PlusIcon size={16} />
            Ajouter
            <span className="sr-only"> {service.name} à votre sélection</span>
          </Button>
        )}
      </div>
    </article>
  );
}

/** « 1re », « 2e », « 3e »… */
export function ordinal(position: number): string {
  return position === 1 ? "1re" : `${position}e`;
}
