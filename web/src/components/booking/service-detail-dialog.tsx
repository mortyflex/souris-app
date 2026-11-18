"use client";

import { useEffectEvent, useId, useLayoutEffect, useRef, type Ref, type RefObject } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { ClockIcon, CloseIcon } from "@/components/ui/icons";
import { formatDuration, type BookableService } from "@/features/availability/availability";
import { descriptionParagraphs, formatServicePrice, PRICE_TO_CONFIRM } from "@/features/availability/service-catalog";
import { presentModalDialog } from "@/lib/modal-dialog";
import { cn } from "@/lib/utils";

/**
 * The whole description of ONE service, read without leaving the list: a
 * centered Nacre modal from the `sm` breakpoint (tablets, desktops), a bottom
 * sheet on a phone — ONE native modal `<dialog>` whose panel changes shape.
 *
 * What it shows is what the card already received from the server: the name
 * (Fraunces), its category when there is one, the duration, the price (« Tarif
 * à confirmer » for 0, « Tarif indicatif » beside a positive one, nothing when
 * the server sent none) and the description as plain text — React escapes it,
 * never markup —, one paragraph per blank line, its line breaks kept.
 *
 * The browser makes the page behind it inert and closes it on Escape;
 * `presentModalDialog` adds the first focus (« Fermer le détail »), the
 * backdrop press and the focus back on « Voir le détail ». While it is open the
 * page does not scroll (`data-scroll-lock`, globals.css); the description
 * scrolls inside the panel (keyboard included: it is a focusable region). It
 * touches nothing of the booking: no selection, date, time or detail changes.
 */
export function ServiceDetailDialog({
  service,
  returnFocusRef,
  onClosed,
}: {
  service: BookableService;
  /** The control that opened it: the focus goes back there. */
  returnFocusRef: RefObject<HTMLElement | null>;
  onClosed: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const notifyClosed = useEffectEvent(onClosed);

  // Before the first paint: the dialog is never seen in the page's flow.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    return presentModalDialog(dialog, {
      initialFocus: closeRef.current,
      returnFocus: returnFocusRef.current,
      onClosed: () => notifyClosed(),
    });
  }, [returnFocusRef]);

  return <ServiceDetailDialogView service={service} dialogRef={dialogRef} closeRef={closeRef} onClose={() => dialogRef.current?.close()} />;
}

/** The dialog itself, without behavior: what a customer reads. */
export function ServiceDetailDialogView({
  service,
  dialogRef,
  closeRef,
  onClose,
}: {
  service: BookableService;
  dialogRef?: Ref<HTMLDialogElement>;
  closeRef?: Ref<HTMLButtonElement>;
  onClose: () => void;
}) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const price = formatServicePrice(service.priceCents);
  const paragraphs = service.description === undefined ? [] : descriptionParagraphs(service.description);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={paragraphs.length > 0 ? descriptionId : undefined}
      data-scroll-lock=""
      className={cn(
        // The dialog covers the viewport, transparent: a press around the panel lands on it (and closes it).
        "fixed inset-0 m-0 hidden size-full max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0 text-foreground open:flex",
        "items-end justify-center sm:items-center sm:p-6",
        "backdrop:bg-[rgb(25_22_63/0.36)] motion-safe:backdrop:animate-[bz-fade_200ms_ease-out]",
      )}
    >
      <div
        data-dialog-panel=""
        className={cn(
          // Phone: a bottom sheet, as tall as its content, 85 % of the viewport at most.
          "flex max-h-[85vh] w-full flex-col overflow-hidden bg-background supports-[height:100dvh]:max-h-[85dvh]",
          "rounded-t-[1.75rem] pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(31,28,61,0.18)]",
          "motion-safe:animate-[bz-sheet-in_var(--bz-duration-panel)_var(--bz-ease-out)_both]",
          // Tablet and desktop: a centered modal, its reading width kept.
          "sm:max-h-[min(85vh,46rem)] sm:max-w-[38rem] sm:rounded-[1.75rem] sm:pb-0 sm:shadow-[0_24px_64px_rgba(31,28,61,0.24)] sm:supports-[height:100dvh]:max-h-[min(85dvh,46rem)]",
          "sm:motion-safe:animate-[bz-dialog-in_var(--bz-duration-disclosure)_var(--bz-ease-out)_both]",
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-foreground/15 sm:hidden" />
        <header className="flex shrink-0 items-start gap-4 px-6 pt-4 sm:px-8 sm:pt-7">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1.5">
            {service.category !== undefined ? (
              <p className="type-caption uppercase tracking-[0.12em] text-lavender-700 [overflow-wrap:anywhere]">{service.category.name}</p>
            ) : null}
            <h2 id={titleId} className="type-title [overflow-wrap:anywhere]">
              {service.name}
            </h2>
          </div>
          <IconButton ref={closeRef} label="Fermer le détail" onClick={onClose} className="-mr-1.5">
            <CloseIcon size={18} />
          </IconButton>
        </header>

        <p className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/70 px-6 pt-3 pb-5 sm:px-8 sm:pb-6">
          <span className="type-meta inline-flex items-center gap-1.5 rounded-full bg-lavender-50 px-2.5 py-1 tabular-nums text-lavender-700">
            <ClockIcon size={14} />
            {formatDuration(service.durationMinutes)}
          </span>
          {price === PRICE_TO_CONFIRM ? (
            <span data-price="" className="type-meta text-foreground/65">
              {price}
            </span>
          ) : price !== undefined ? (
            <span className="inline-flex items-baseline gap-2">
              <span data-price="" className="type-label tabular-nums text-foreground">
                {price}
              </span>
              <span className="type-meta text-foreground/60">Tarif indicatif</span>
            </span>
          ) : null}
        </p>

        {paragraphs.length > 0 ? (
          // Focusable so a keyboard can scroll a long description (arrows, Page Down). Its last
          // 1.5rem fade out, over the bottom padding: a long text never ends cut at the panel's edge.
          <div
            role="region"
            aria-label="Description de la prestation"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-5 pb-7 [mask-image:linear-gradient(to_bottom,#000_calc(100%-1.5rem),transparent)] sm:px-8 sm:pt-6 sm:pb-8"
          >
            <div id={descriptionId} className="flex max-w-[62ch] flex-col gap-4">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="type-body whitespace-pre-line text-foreground/80 [overflow-wrap:anywhere]">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
