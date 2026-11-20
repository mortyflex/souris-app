import type { MapsProvider } from "@/features/location/directions";
import { cn } from "@/lib/utils";

/**
 * The small mark of a navigation application, beside its name — never instead
 * of it: the name is what identifies the provider (and what assistive
 * technologies read); the mark only helps the eye find it.
 *
 * Original line glyphs on the site's 24 px icon grid, tinted with a colour
 * associated with each provider — NOT the providers' logos, which are their
 * owners' marks and are not reproduced here:
 *
 *   Apple Plans   a navigation arrow, Apple blue
 *   Google Maps   a map pin, Google red
 *
 * Shown in the « Ouvrir avec » chooser only. Decorative (`aria-hidden`): the
 * link around it carries its name.
 */
const GLYPHS: Readonly<Record<MapsProvider, React.ReactNode>> = {
  apple: <path d="M19.5 4.5 4.5 10.8l6.4 2.3 2.3 6.4Z" />,
  google: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-10.6a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.3" r="2.3" />
    </>
  ),
};

/** Each provider's tint: the glyph's colour, and a pale wash of it for a tile. */
const TINTS: Readonly<Record<MapsProvider, { readonly glyph: string; readonly tile: string }>> = {
  apple: { glyph: "text-[#0a6fd8]", tile: "bg-[#e9f2ff]" },
  google: { glyph: "text-[#c5221f]", tile: "bg-[#fdeceb]" },
};

/** The glyph alone, in the provider's colour. */
export function ProviderGlyph({ provider, size = 16, className }: { provider: MapsProvider; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-provider-mark={provider}
      className={cn("shrink-0", TINTS[provider].glyph, className)}
    >
      {GLYPHS[provider]}
    </svg>
  );
}

/** The glyph on its pale tile — a row of the « Ouvrir avec » chooser. */
export function ProviderTile({ provider }: { provider: MapsProvider }) {
  return (
    <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-[0.875rem]", TINTS[provider].tile)}>
      <ProviderGlyph provider={provider} size={20} />
    </span>
  );
}
