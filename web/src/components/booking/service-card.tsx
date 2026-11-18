"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { CheckIcon, ChevronDownIcon, ClockIcon } from "@/components/ui/icons";
import { formatDuration, type BookableService } from "@/features/availability/availability";
import { formatServicePrice, isClamped, PRICE_TO_CONFIRM } from "@/features/availability/service-catalog";
import { cn } from "@/lib/utils";

/**
 * ONE bookable service, as a customer chooses it: its name, its duration, its
 * price (the server's — « Tarif à confirmer » for 0, nothing when the server
 * gave none), the first two lines of its description, and two DISTINCT
 * actions — never a button inside a button:
 *
 *   * « Choisir » selects the service (the flow then moves on);
 *   * « Voir le détail » / « Réduire » opens and closes the whole description,
 *     offered only when the two lines actually hide some of it.
 *
 * The description is plain text rendered as text (React escapes it; it is
 * never interpreted as markup); its line breaks are kept. Collapsed, it is
 * clipped at two lines and, when some of it is hidden, the end of the second
 * line fades out — no ellipsis glyph, so no « lumineux.… ». Without one, the
 * card simply has none — no empty placeholder.
 *
 * Built to be reused as is when a booking holds several services: the action
 * is the only part that would change.
 */

export interface ServiceCardProps {
  readonly service: BookableService;
  readonly selected: boolean;
  readonly disabled?: boolean;
  /** 3 for a plain list, 4 under a category heading. */
  readonly headingLevel: 3 | 4;
  readonly onChoose: () => void;
}

export function ServiceCard(props: ServiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  // Measured while the two lines are applied — and again whenever the card's
  // width changes (rotation, window resize). The observer's first callback runs
  // before the next paint, so the control never flickers in.
  useEffect(() => {
    const element = descriptionRef.current;
    if (element === null || expanded || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setTruncated(isClamped(element)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, props.service.description]);

  return (
    <ServiceCardView
      {...props}
      descriptionRef={descriptionRef}
      expanded={expanded}
      truncated={truncated}
      onToggleDetail={() => setExpanded((current) => !current)}
    />
  );
}

export interface ServiceCardViewProps extends ServiceCardProps {
  /** The whole description is shown. */
  readonly expanded: boolean;
  /** The two lines hide part of the description (measured by `ServiceCard`). */
  readonly truncated: boolean;
  readonly onToggleDetail: () => void;
  readonly descriptionRef?: Ref<HTMLParagraphElement>;
}

/** The card itself, without state: what the two measured facts mean on screen. */
export function ServiceCardView({
  service,
  selected,
  disabled = false,
  headingLevel,
  onChoose,
  expanded,
  truncated,
  onToggleDetail,
  descriptionRef,
}: ServiceCardViewProps) {
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const descriptionId = `${baseId}-description`;
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const price = formatServicePrice(service.priceCents);
  const offersDetail = service.description !== undefined && (truncated || expanded);

  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        "flex h-full flex-col gap-4 rounded-[1.4rem] border bg-background p-5 shadow-card transition-[border-color,box-shadow] duration-[var(--bz-duration-state)] sm:p-6",
        selected ? "border-accent ring-1 ring-accent/25" : "border-border/80",
      )}
    >
      <div className="flex flex-col gap-2.5">
        <Heading id={nameId} className="type-subtitle min-w-0 [overflow-wrap:anywhere]">
          {service.name}
        </Heading>
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
          data-collapsed={expanded ? undefined : ""}
          className={cn(
            "type-body-small whitespace-pre-line text-foreground/75 [overflow-wrap:anywhere]",
            // Collapsed: exactly two lines, clipped. Not `line-clamp`: its built-in « … »
            // landed after the period of a paragraph that ends the second line
            // (« lumineux.… »). A browser without the `lh` unit shows the whole text.
            !expanded && "relative max-h-[2lh] overflow-hidden",
            // Some of it is hidden: the end of the second line fades out instead.
            !expanded &&
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
            type="button"
            aria-expanded={expanded}
            aria-controls={descriptionId}
            onClick={onToggleDetail}
            className="type-label inline-flex min-h-11 items-center gap-1.5 rounded-full text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {expanded ? "Réduire" : "Voir le détail"}
            <ChevronDownIcon
              size={16}
              className={cn("transition-transform duration-[var(--bz-duration-state)]", expanded && "rotate-180")}
            />
          </button>
        ) : null}
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
      </div>
    </article>
  );
}
