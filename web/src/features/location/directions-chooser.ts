import type { DirectionsLinks } from "./directions";

/**
 * When « Itinéraire » — and the map, which does the same — asks which
 * application to open, and when it simply opens one:
 *
 *   iPhone, iPad            « Ouvrir avec »: Apple Plans, then Google Maps;
 *                           nothing opens until she picks one
 *   an iPad presenting      the same chooser, once the browser shows a touch
 *   itself as a Mac         screen (`navigator.maxTouchPoints`): the request
 *                           alone cannot tell it from a Mac
 *   anywhere else           a plain link, one tap or click — Apple Plans on a
 *                           Mac, Google Maps on Android and every other
 *                           platform; never a sheet to go through
 *
 * Before the page runs — the server's render, the hydration, a browser without
 * JavaScript — every trigger is the plain link it was rendered as. The chooser
 * is the website's own list, never the operating system's: a website cannot
 * know which applications a device has, so it promises none — each provider's
 * link opens its application where it is installed and its website otherwise.
 */

/** What the browser says of its screen. */
export interface BrowserTouch {
  readonly touchScreen: boolean;
}

/** A touch screen, as a browser reports it: an iPad says 5 touch points, a Mac 0. */
export function hasTouchScreen(navigatorLike: { readonly maxTouchPoints?: number } | undefined): boolean {
  return (navigatorLike?.maxTouchPoints ?? 0) > 1;
}

/** Whether « Itinéraire » opens the chooser in this browser. */
export function chooserActive(directions: DirectionsLinks, browser: BrowserTouch): boolean {
  const offer = directions.chooser?.offer;
  return offer === "always" || (offer === "touch-screen" && browser.touchScreen);
}

/** What decides whether an activation is a plain one (the fields of a `MouseEvent`). */
export interface ActivationLike {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/**
 * Whether this activation opens the chooser — instead of following the link.
 * A modified or secondary click (a new tab, a new window, a download) always
 * keeps the browser's own behaviour.
 */
export function opensChooser(active: boolean, activation: ActivationLike): boolean {
  if (!active || activation.defaultPrevented) return false;
  return activation.button === 0 && !activation.metaKey && !activation.ctrlKey && !activation.shiftKey && !activation.altKey;
}

// ---- Words ------------------------------------------------------------------

export const DIRECTIONS_LABEL = "Itinéraire";
export const CHOOSER_TITLE = "Ouvrir avec";
export const CHOOSER_CLOSE_LABEL = "Fermer";
/** Said under the list: what a tap does, without promising what the device has. */
export const CHOOSER_NOTE = "L’application s’ouvre si elle est installée sur cet appareil, sinon son site.";

/** A trigger that is a link: where it goes, in which application, and that it leaves the page. */
export function directionsLinkLabel(spoken: string, providerName: string): string {
  return `${DIRECTIONS_LABEL} vers ${spoken} (${providerName}, nouvel onglet)`;
}

/** A trigger that opens the chooser: where to, and that the application is chosen next. */
export function chooserTriggerLabel(spoken: string): string {
  return `${DIRECTIONS_LABEL} vers ${spoken} : choisir l’application`;
}

/** A row of the chooser. */
export function chooserOptionLabel(spoken: string, providerName: string): string {
  return `${providerName} : itinéraire vers ${spoken} (nouvel onglet)`;
}
