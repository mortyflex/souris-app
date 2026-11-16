import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Container } from "@/components/ui/container";

export type SiteHeaderVariant = "profile" | "flow";

const LOGO_CLASS = "h-11 w-auto lg:h-[58px]";
const LOGO_SIZES = "(min-width: 1024px) 160px, 122px";

/**
 * The bar at the top of the public booking pages: the BeautIzzy wordmark
 * (44 px, 58 px from 1024 px; original proportions) and, depending on the page:
 *   - profile: a quiet « Pour les professionnels » link (desktop only);
 *   - flow:    the wordmark alone, not even a link — nothing pulls a
 *              customer out of a booking in progress.
 */
export function SiteHeader({ variant }: { variant: SiteHeaderVariant }) {
  return (
    <header className="border-b border-border/70 bg-background">
      <Container className="flex h-16 items-center justify-between gap-4 lg:h-20">
        {variant === "flow" ? (
          <BrandLogo priority className={LOGO_CLASS} sizes={LOGO_SIZES} />
        ) : (
          <Link href="/" aria-label="BeautIzzy — accueil" className="-ml-1.5 rounded-lg p-1.5">
            <BrandLogo priority className={LOGO_CLASS} sizes={LOGO_SIZES} />
          </Link>
        )}
        {variant === "profile" ? (
          <Link
            href="/"
            className="type-body-small hidden items-center gap-2 rounded-full px-3.5 py-2 font-semibold text-foreground/70 transition-colors duration-[var(--bz-duration-state)] hover:bg-lavender-50 hover:text-foreground lg:inline-flex"
          >
            Pour les professionnels
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </Container>
    </header>
  );
}
