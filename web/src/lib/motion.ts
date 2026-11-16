/**
 * Browser-side motion helpers — the ONE place that decides whether something
 * may move and when it enters the view. No React, no dependency; every
 * animated component of the site goes through these.
 */

/** The reader asked for reduced motion: render end states directly. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
