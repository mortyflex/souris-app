import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PendingPlatforms, StoreBadges } from "@/components/marketing/store-links";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { contactHref } from "@/lib/site";
import { storeAvailability, type StoreAvailability } from "@/lib/stores";

import { DesktopNav, HeaderScrollState, MobileMenu } from "./header-controls";
import { HomeLink } from "./home-link";

/** The sections of the landing page the navigation leads to. */
export const MARKETING_NAV = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#reservation-en-ligne", label: "Réservation en ligne" },
  { href: "/#tarif", label: "Tarif" },
  { href: "/#questions", label: "Questions" },
] as const;

export type SiteHeaderVariant = "marketing" | "profile" | "flow";

const LOGO_CLASS = "h-11 w-auto lg:h-[58px]";
const LOGO_SIZES = "(min-width: 1024px) 160px, 122px";

/**
 * The bar at the top of every page: the BeautIzzy wordmark (44 px, 58 px from
 * 1024 px; original proportions) — a link to the very top of the home page
 * (`HomeLink`) — and, depending on the page:
 *   - marketing: three zones on desktop — brand, the landing's sections
 *     (centred, the current one marked), ONE action whose destination exists;
 *     on mobile, the brand and a menu. Sticky, reinforced once scrolled;
 *   - profile:   a quiet « Pour les professionnels » link (desktop only);
 *   - flow:      the wordmark alone, not even a link — nothing pulls a
 *                customer out of a booking in progress.
 *
 * The action follows the truth (src/lib/stores.ts): « Télécharger » once a
 * store listing is public; before, « Demander un accès » if a contact address
 * is configured; otherwise a plain availability statement — never a dead or
 * pretend download button.
 */
export function SiteHeader({ variant, availability = storeAvailability() }: { variant: SiteHeaderVariant; availability?: StoreAvailability }) {
  if (variant !== "marketing") {
    return (
      <header className="border-b border-border/70 bg-background">
        <Container className="flex h-16 items-center justify-between gap-4 lg:h-20">
          {variant === "flow" ? (
            <BrandLogo priority className={LOGO_CLASS} sizes={LOGO_SIZES} />
          ) : (
            <HomeLink aria-label="BeautIzzy — accueil" className="-ml-1.5 rounded-lg p-1.5">
              <BrandLogo priority className={LOGO_CLASS} sizes={LOGO_SIZES} />
            </HomeLink>
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

  const contact = contactHref("Demande d’accès à BeautIzzy");
  const launched = availability.available.length > 0;

  return (
    <header className="site-header sticky top-0 z-40">
      <HeaderScrollState />
      <Container className="flex h-16 items-center justify-between gap-4 lg:grid lg:h-20 lg:grid-cols-[1fr_auto_1fr]">
        <HomeLink aria-label="BeautIzzy — accueil" className="-ml-1.5 justify-self-start rounded-xl p-1.5 focus-visible:outline-2 focus-visible:outline-accent">
          <BrandLogo priority className={LOGO_CLASS} sizes={LOGO_SIZES} />
        </HomeLink>

        <DesktopNav items={MARKETING_NAV} />

        <div className="hidden justify-self-end lg:block">
          {launched ? (
            <Button asChild size="md">
              <Link href="/#telecharger">Télécharger</Link>
            </Button>
          ) : contact ? (
            <Button asChild size="md">
              <a href={contact}>Demander un accès</a>
            </Button>
          ) : (
            <p className="type-meta inline-flex items-center gap-2 font-semibold text-foreground/65">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              Bientôt pour iPhone et Android
            </p>
          )}
        </div>

        <MobileMenu
          items={MARKETING_NAV}
          action={
            launched ? (
              <StoreBadges stores={availability.available} height={40} />
            ) : contact ? (
              <Button asChild size="lg" className="w-full">
                <a href={contact}>Demander un accès</a>
              </Button>
            ) : undefined
          }
          note={availability.pending.length > 0 ? <PendingPlatforms stores={availability.pending} /> : undefined}
        />
      </Container>
    </header>
  );
}
