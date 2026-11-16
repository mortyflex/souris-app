"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

import { observeEntry, prefersReducedMotion } from "@/lib/motion";

/**
 * Lets its content rise softly into view, ONCE.
 *
 * The server renders the content visible; only an element the script finds
 * BELOW the fold is hidden (`data-reveal="pending"`) and then revealed when
 * it enters — so nothing above the fold ever blinks, nothing is hidden
 * without JavaScript, and reduced motion shows everything at once. No React
 * state: the attribute is set on the element itself (no re-render).
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className,
  id,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Stagger, in ms, after the element is seen. */
  delay?: number;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || prefersReducedMotion()) return;
    if (delay > 0) element.style.setProperty("--reveal-delay", `${delay}ms`);
    return observeEntry(
      element,
      () => {
        if (element.dataset.reveal === "pending") element.dataset.reveal = "shown";
      },
      undefined,
      (isVisible) => {
        if (!isVisible) element.dataset.reveal = "pending";
      },
    );
  }, [delay]);

  return (
    <Tag ref={ref} className={className} id={id}>
      {children}
    </Tag>
  );
}
