"use client";

import {
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { IconButton } from "@/components/ui/icon-button";
import { ArrowUpRightIcon, CloseIcon } from "@/components/ui/icons";
import type { DirectionsLinks } from "@/features/location/directions";
import {
  CHOOSER_CLOSE_LABEL,
  CHOOSER_NOTE,
  CHOOSER_TITLE,
  chooserActive,
  chooserOptionLabel,
  chooserTriggerLabel,
  directionsLinkLabel,
  hasTouchScreen,
  opensChooser,
} from "@/features/location/directions-chooser";
import { presentModalDialog } from "@/lib/modal-dialog";
import { cn } from "@/lib/utils";

import { ProviderTile } from "./provider-mark";

/**
 * « Itinéraire » — and the map, which does the same — with the « Ouvrir avec »
 * chooser of an iPhone or an iPad (`directions-chooser.ts` decides when).
 *
 * The trigger is ALWAYS rendered as the plain link to the platform's
 * application (new tab, no opener, no referrer): that is what the server
 * sends, what works without JavaScript, and what Android and every computer
 * keep — Google Maps or Apple Plans in one tap. Once the page runs on an
 * iPhone or an iPad it becomes a button that opens the chooser — its role,
 * its name and its pop-up said to assistive technologies — and a tap opens
 * nothing else.
 *
 * The chooser is a native modal `<dialog>` (`presentModalDialog`), rendered
 * into the body (it never inherits the text styles around its trigger): the page
 * behind it is inert, Escape, « Fermer » and a press on the backdrop close it,
 * the first focus goes to « Fermer » and the focus comes back to the trigger.
 * A bottom sheet on a phone (above the safe area), a small centred panel on a
 * tablet; it moves only when motion is welcome. Each row is a link to one
 * application in a new tab: the booking flow behind keeps every choice. It
 * never redirects by itself, never tries an application scheme, never asks
 * for a position.
 */

/** Nothing to watch: a platform and a screen do not change while the page is open. */
function subscribeNothing(): () => void {
  return () => undefined;
}

function browserHasTouchScreen(): boolean {
  return hasTouchScreen(typeof navigator === "undefined" ? undefined : navigator);
}

/** Whether « Itinéraire » opens the chooser here. `false` on the server and while hydrating: the plain link first. */
function useChooserActive(directions: DirectionsLinks): boolean {
  return useSyncExternalStore(subscribeNothing, () => chooserActive(directions, { touchScreen: browserHasTouchScreen() }), () => false);
}

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * The trigger's element, for a given mode — no state, no effect: what each
 * mode renders and says.
 */
export function DirectionsTriggerAnchor({
  directions,
  spoken,
  chooser,
  className,
  children,
  anchorRef,
  onActivate,
  onKeyDown,
}: {
  directions: DirectionsLinks;
  /** The address in one line. */
  spoken: string;
  /** True on an iPhone or an iPad, once the page runs: the trigger opens the chooser. */
  chooser: boolean;
  className?: string;
  children: ReactNode;
  anchorRef?: Ref<HTMLAnchorElement>;
  onActivate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLAnchorElement>) => void;
}) {
  const { primary } = directions;
  return (
    <a
      ref={anchorRef}
      href={primary.url}
      {...external}
      aria-label={chooser ? chooserTriggerLabel(spoken) : directionsLinkLabel(spoken, primary.providerName)}
      data-provider={primary.provider}
      {...(chooser ? { role: "button", "aria-haspopup": "dialog" as const, "data-chooser": "" } : {})}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={className}
    >
      {children}
    </a>
  );
}

/** « Itinéraire » or the map: the chooser's button on an iPhone or an iPad, a direct link everywhere else. */
export function DirectionsTrigger({
  directions,
  spoken,
  className,
  children,
}: {
  directions: DirectionsLinks;
  spoken: string;
  className?: string;
  children: ReactNode;
}) {
  const chooser = useChooserActive(directions);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLAnchorElement>(null);

  return (
    <>
      <DirectionsTriggerAnchor
        directions={directions}
        spoken={spoken}
        chooser={chooser}
        className={className}
        anchorRef={anchorRef}
        onActivate={(event) => {
          if (!opensChooser(chooser, event)) return;
          event.preventDefault();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          // A link follows on Enter (a click); as a button it also opens on Space.
          if (!chooser || event.key !== " ") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </DirectionsTriggerAnchor>
      {open
        ? // Mounted only after a tap, in the browser — into the body, so that it never inherits the
          // typography of the summary or the row that holds its trigger.
          createPortal(<DirectionsChooserDialog directions={directions} spoken={spoken} returnFocusRef={anchorRef} onClosed={() => setOpen(false)} />, document.body)
        : null}
    </>
  );
}

/** The chooser, shown as a modal from its first paint, gone once closed. */
export function DirectionsChooserDialog({
  directions,
  spoken,
  returnFocusRef,
  onClosed,
}: {
  directions: DirectionsLinks;
  spoken: string;
  /** The trigger that opened it: the focus goes back there. */
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

  const close = () => dialogRef.current?.close();
  // A chosen row opens its application (the link's own default action, in a new tab), then the
  // chooser closes: `close()` only hides it; the `close` event — and the unmount — come in a later task.
  return <DirectionsChooserView directions={directions} spoken={spoken} dialogRef={dialogRef} closeRef={closeRef} onClose={close} onChoose={close} />;
}

/** The chooser itself, without behaviour: what a visitor reads. */
export function DirectionsChooserView({
  directions,
  spoken,
  dialogRef,
  closeRef,
  onClose,
  onChoose,
}: {
  directions: DirectionsLinks;
  spoken: string;
  dialogRef?: Ref<HTMLDialogElement>;
  closeRef?: Ref<HTMLButtonElement>;
  onClose: () => void;
  onChoose: () => void;
}) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const destinationId = `${baseId}-destination`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={destinationId}
      data-scroll-lock=""
      data-directions-chooser=""
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
          // Phone: a bottom sheet as tall as its few rows, above the home indicator.
          "flex max-h-[85vh] w-full flex-col overflow-y-auto overscroll-contain bg-background supports-[height:100dvh]:max-h-[85dvh]",
          "rounded-t-[1.75rem] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(31,28,61,0.18)]",
          "motion-safe:animate-[bz-sheet-in_var(--bz-duration-panel)_var(--bz-ease-out)_both]",
          // Tablet: a small centred panel.
          "sm:max-w-[26rem] sm:rounded-[1.75rem] sm:pb-2 sm:shadow-[0_24px_64px_rgba(31,28,61,0.24)]",
          "sm:motion-safe:animate-[bz-dialog-in_var(--bz-duration-disclosure)_var(--bz-ease-out)_both]",
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-foreground/15 sm:hidden" />
        <header className="flex shrink-0 items-start gap-4 px-6 pt-3.5 sm:pt-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1.5">
            <h2 id={titleId} className="type-title">
              {CHOOSER_TITLE}
            </h2>
            <p id={destinationId} className="type-body-small text-foreground/65 [overflow-wrap:anywhere]">
              Itinéraire vers {spoken}
            </p>
          </div>
          <IconButton ref={closeRef} label={CHOOSER_CLOSE_LABEL} onClick={onClose} className="-mr-1.5">
            <CloseIcon size={18} />
          </IconButton>
        </header>

        <ul className="flex flex-col gap-1 px-3 pt-4 pb-1">
          {(directions.chooser?.links ?? [directions.primary]).map((link) => (
            <li key={link.provider}>
              <a
                href={link.url}
                {...external}
                aria-label={chooserOptionLabel(spoken, link.providerName)}
                data-provider={link.provider}
                onClick={onChoose}
                className="flex min-h-14 items-center gap-3.5 rounded-[1.1rem] px-3 py-2 transition-colors duration-[var(--bz-duration-state)] hover:bg-lavender-25 active:bg-lavender-50"
              >
                <ProviderTile provider={link.provider} />
                <span className="type-label min-w-0 flex-1 [overflow-wrap:anywhere]">{link.providerName}</span>
                <ArrowUpRightIcon size={16} className="shrink-0 text-foreground/40" />
              </a>
            </li>
          ))}
        </ul>

        <p className="type-meta px-6 pt-2 pb-3 text-foreground/55">{CHOOSER_NOTE}</p>
      </div>
    </dialog>
  );
}
