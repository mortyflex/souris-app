/**
 * The BeautIzzy logo always leads to the very top of the home page — the ONE
 * rule behind `HomeLink` (components/layout/home-link.tsx). No React here.
 *
 * Why it is needed: a Next.js `<Link>` always takes the click over, and the
 * App Router only scrolls after a navigation when a route segment changes and
 * its top is out of view. So, left to itself, the logo
 *   - does nothing on the home page at « / » (same URL: nothing changes);
 *   - lands under the sticky header from « /#tarif » (it scrolls <main> into view);
 *   - keeps the previous page's offset when coming from another route.
 */

/** What a click on the logo carries that matters here (a DOM or React mouse event). */
export interface HomeClick {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/**
 * What the logo does on this click:
 *   - `scroll`: already on the home page — scroll it to its top, in place;
 *   - `navigate`: another page — Next.js navigates, and the home page is put at its top on arrival;
 *   - `browser`: a modified or non-primary click (new tab, new window, download) — the browser's own behavior.
 */
export function homeLinkAction(pathname: string, click: HomeClick): "scroll" | "navigate" | "browser" {
  if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return "browser";
  return pathname === "/" ? "scroll" : "navigate";
}

/** The parts of `window` the in-place scroll uses. */
export interface ScrollWindow {
  readonly location: { readonly search: string; readonly hash: string };
  readonly history: { pushState(data: unknown, unused: string, url?: string): void };
  scrollTo(options: ScrollToOptions): void;
}

/**
 * Scrolls the home page to its absolute top — smoothly, or at once under
 * reduced motion. A fragment (« /#tarif ») or a query is left the way a link
 * to « / » leaves it: a new history entry at « / », so « Back » returns to the
 * section. `null` state: Next.js adds its own and keeps its router in step.
 */
export function scrollHomeToTop(win: ScrollWindow, reducedMotion: boolean): void {
  if (win.location.search !== "" || win.location.hash !== "") win.history.pushState(null, "", "/");
  win.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? "instant" : "smooth" });
}

/*
 * Arrival from another page: the logo there marks it, the home page's logo
 * takes the mark when it mounts and starts the page at its top. A plain
 * module flag — no listener, no context — that only the logo sets.
 */
let arrivalPending = false;

export function markHomeArrival(): void {
  arrivalPending = true;
}

/** True once after `markHomeArrival`, then false until the next mark. */
export function takeHomeArrival(): boolean {
  const pending = arrivalPending;
  arrivalPending = false;
  return pending;
}

/** A click on the logo, as `HomeLink` receives it. */
export interface HomeClickEvent extends HomeClick {
  preventDefault(): void;
}

/**
 * The logo's click: on the home page, the click is taken over (no Next.js
 * navigation to the same URL) and the page scrolls to its top; from another
 * page, Next.js navigates and the arrival is marked; anything else is left to
 * the browser. Returns what was done.
 */
export function handleHomeLinkClick(
  pathname: string,
  event: HomeClickEvent,
  win: ScrollWindow,
  reducedMotion: boolean,
): "scroll" | "navigate" | "browser" {
  const action = homeLinkAction(pathname, event);
  if (action === "scroll") {
    event.preventDefault();
    scrollHomeToTop(win, reducedMotion);
  } else if (action === "navigate") {
    markHomeArrival();
  }
  return action;
}

/** The home page's logo mounts: if the logo brought the visitor here, the page starts at its top, at once. */
export function settleHomeArrival(pathname: string, win: Pick<ScrollWindow, "scrollTo">): boolean {
  if (pathname !== "/" || !takeHomeArrival()) return false;
  win.scrollTo({ top: 0, left: 0, behavior: "instant" });
  return true;
}
