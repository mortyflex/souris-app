import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A round button whose only content is an icon. The label is REQUIRED: it is
 * what assistive technologies speak and what voice control targets.
 */
function IconButton({
  label,
  children,
  className,
  size = "md",
  ...props
}: Omit<ComponentProps<"button">, "aria-label" | "children"> & { label: string; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full border border-border bg-background text-foreground transition-[background-color,opacity] duration-[var(--bz-duration-state)] hover:bg-lavender-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-background",
        size === "sm" ? "size-9" : "size-11",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { IconButton };
