import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * A placeholder drawn on the REAL grid of the content it stands for (same
 * size, same radius), with the 1.4 s sheen of DESIGN.md §6 — static under
 * reduced motion. Decorative: the region around it carries `aria-busy` and a
 * spoken « Chargement… ».
 */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("skeleton rounded-full", className)} {...props} />;
}

export { Skeleton };
