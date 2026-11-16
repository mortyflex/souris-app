/**
 * Browser-side motion helpers — the ONE place that decides whether something
 * may move and when it enters the view. No React, no dependency; every
 * animated component of the site goes through these.
 */

/** The reader asked for reduced motion: render end states directly. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface EntryOptions {
  /** Margin of the viewport considered « seen » (a negative bottom margin waits until the element is well inside). */
  readonly rootMargin?: string;
  readonly threshold?: number;
}

/**
 * Calls `onFirstReport(isVisible)` once with the element's first position,
 * then `onEnter()` once when it enters the view. Returns a cleanup. Without
 * IntersectionObserver, the element counts as visible at once.
 */
export function observeEntry(
  element: Element,
  onEnter: () => void,
  { rootMargin = "0px 0px -12% 0px", threshold = 0 }: EntryOptions = {},
  onFirstReport?: (isVisible: boolean) => void,
): () => void {
  if (typeof IntersectionObserver === "undefined") {
    onFirstReport?.(true);
    onEnter();
    return () => undefined;
  }
  let first = true;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (first) {
          first = false;
          onFirstReport?.(entry.isIntersecting);
        }
        if (entry.isIntersecting) {
          observer.disconnect();
          onEnter();
          return;
        }
      }
    },
    { rootMargin, threshold },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Marks `element` with `data-offscreen="true"` while it is out of the view, so
 * its ambient CSS loops pause (`animation-play-state: paused`). Returns a cleanup.
 */
export function pauseWhenOffscreen(element: HTMLElement): () => void {
  if (typeof IntersectionObserver === "undefined") return () => undefined;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) element.dataset.offscreen = entry.isIntersecting ? "false" : "true";
  });
  observer.observe(element);
  return () => observer.disconnect();
}
