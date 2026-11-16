"use client";

import { useLinkStatus } from "next/link";

import { ArrowRightIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

/**
 * The trailing glyph of a link to a dynamic page: an arrow at rest, a small
 * spinner IN THE SAME SLOT while the next page is on its way (no layout
 * shift; it only appears after 120 ms, so a fast navigation never flashes).
 * Must be rendered inside a `next/link` `Link`.
 */
export function LinkPendingGlyph() {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden="true" className="relative inline-grid size-[18px] shrink-0 place-items-center">
      <ArrowRightIcon size={18} className={pending ? "opacity-0" : "opacity-100"} />
      {pending ? (
        <span className="absolute inset-0 grid place-items-center animate-[bz-fade_var(--bz-duration-state)_ease_var(--bz-duration-tap)_both]">
          <Spinner size={16} />
        </span>
      ) : null}
    </span>
  );
}
