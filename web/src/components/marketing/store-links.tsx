import Image from "next/image";

import { pendingSentence, type StoreInfo, type StoreLink } from "@/lib/stores";
import { cn } from "@/lib/utils";

/**
 * The official store badges and the honest « Bientôt » — every place of the
 * site that talks about downloading BeautIzzy renders these, from ONE
 * configuration (src/lib/stores.ts). A badge exists only for a verified
 * public listing; the artwork is drawn unchanged, never animated or tinted.
 */

/** One official badge, as a link to the public listing. `height`: the badge's VISIBLE height, in px. */
export function StoreBadge({ store, height }: { store: StoreLink; height: number }) {
  const drawn = Math.round(height * store.badge.heightRatio);
  return (
    <a
      href={store.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
      style={{ height }}
    >
      <Image
        src={store.badge.src}
        width={store.badge.width}
        height={store.badge.height}
        alt={`${store.badge.alt} — BeautIzzy pour ${store.platform} (nouvel onglet)`}
        unoptimized
        className="block w-auto max-w-none"
        style={{ height: drawn }}
      />
    </a>
  );
}

/** The badges of every available store, side by side (wrapping on narrow screens). */
export function StoreBadges({ stores, height = 44, className }: { stores: readonly StoreLink[]; height?: number; className?: string }) {
  if (stores.length === 0) return null;
  return (
    <ul aria-label="Télécharger BeautIzzy" className={cn("flex flex-wrap items-center gap-3", className)}>
      {stores.map((store) => (
        <li key={store.id} className="flex">
          <StoreBadge store={store} height={height} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The platforms still to come, as typographic tiles: the platform in the
 * display face, its store in small caps. A statement, not a control — no
 * hover, nothing pressable. No Apple logo (Apple forbids its use by third
 * parties in any form) and therefore no Android robot either, so the pair
 * stays balanced; the names are the identification.
 */
export function PendingPlatforms({
  stores,
  tone = "light",
  layout = "row",
  className,
}: {
  stores: readonly StoreInfo[];
  tone?: "light" | "dark";
  /** « row »: tiles side by side (hero, closing call, menu); « stack »: one per line (a narrow column). */
  layout?: "row" | "stack";
  className?: string;
}) {
  const sentence = pendingSentence(stores);
  if (sentence === undefined) return null;
  const dark = tone === "dark";
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className={cn("type-label", dark ? "text-white" : "text-foreground")}>{sentence}</p>
      <ul aria-label="Plateformes à venir" className={cn("grid gap-2.5", layout === "row" ? "grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] sm:max-w-[25rem]" : "grid-cols-1")}>
        {stores.map((store) => (
          <li
            key={store.id}
            className={cn("platform-tile flex min-w-0 flex-col gap-1.5 rounded-2xl px-4 py-3.5", dark ? "bg-white/10 ring-1 ring-white/15" : "bg-background/85 ring-1 ring-lavender-100")}
          >
            <span className={cn("font-display text-[1.375rem] leading-none tracking-[-0.005em]", dark ? "text-white" : "text-foreground")}>{store.platform}</span>
            <span className={cn("text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.14em]", dark ? "text-lavender-200" : "text-lavender-700")}>
              {store.storeName}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
