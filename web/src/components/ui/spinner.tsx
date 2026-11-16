import { cn } from "@/lib/utils";

/**
 * A small busy ring, in the current text colour — for an ACTION in progress
 * (a button, a status line), never for content (content gets a skeleton).
 * Decorative: the surrounding text says what is happening. Under reduced
 * motion it stops turning; the text still says it.
 */
function Spinner({ className, size = 16 }: { className?: string; size?: 14 | 16 | 18 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        "inline-block shrink-0 rounded-full border-2 border-current border-r-transparent opacity-80 motion-safe:animate-spin",
        className,
      )}
    />
  );
}

export { Spinner };
