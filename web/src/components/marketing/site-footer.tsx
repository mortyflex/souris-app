import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { MARKETING_NAV } from "@/components/layout/site-header";
import { Container } from "@/components/ui/container";
import { publicEnv } from "@/lib/env/public";
import { site } from "@/lib/site";
import { storeAvailability, trademarkNotice, type StoreAvailability } from "@/lib/stores";

import { PendingPlatforms, StoreBadges } from "./store-links";

/**
 * The brand anchors the footer: a large wordmark, the tagline in the display
 * face, then two quiet columns. Legal pages (privacy, terms, legal notice)
 * are not written yet: their links are added when the routes exist — never a
 * link to a page that does not exist, never a dead link styled as one.
 */
function SiteFooter({ availability = storeAvailability() }: { availability?: StoreAvailability }) {
  return (
    <footer className="relative mt-auto overflow-hidden bg-[linear-gradient(180deg,#fff,var(--bz-lavender-25))]">
      <div aria-hidden="true" className="h-px bg-[linear-gradient(90deg,transparent,var(--bz-lavender-200)_20%,var(--bz-accent)_50%,var(--bz-lavender-200)_80%,transparent)]" />
      <Container className="grid gap-10 py-14 sm:grid-cols-3 lg:grid-cols-12 lg:gap-8 lg:py-20">
        <div className="flex flex-col items-start gap-5 sm:col-span-3 lg:col-span-4">
          <BrandLogo className="h-14 lg:h-[4.5rem]" sizes="(min-width: 1024px) 200px, 160px" />
          <p className="max-w-sm font-display text-[1.35rem] leading-snug text-foreground/90 lg:text-[1.6rem]">{site.tagline}.</p>
          <p className="type-body-small max-w-sm text-foreground/65">
            Rendez-vous, clientèle, caisse, produits et statistiques, dans une application mobile pour iPhone et Android, pensée pour votre métier.
          </p>
        </div>

        <nav aria-labelledby="footer-discover" className="lg:col-span-2 lg:col-start-6">
          <p id="footer-discover" className="type-caption mb-4 uppercase tracking-[0.14em] text-lavender-700">
            Découvrir
          </p>
          <ul className="flex flex-col gap-1">
            {MARKETING_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="type-body-small inline-flex min-h-10 items-center text-foreground/75 underline-offset-4 transition-colors duration-[var(--bz-duration-state)] hover:text-lavender-700 hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="lg:col-span-2">
          <p className="type-caption mb-4 uppercase tracking-[0.14em] text-lavender-700">Application</p>
          <div className="flex flex-col gap-3">
            <StoreBadges stores={availability.available} height={40} className="flex-col items-start" />
            <PendingPlatforms stores={availability.pending} layout="stack" />
          </div>
        </div>

        <div className="lg:col-span-3">
          <p className="type-caption mb-4 uppercase tracking-[0.14em] text-lavender-700">Contact</p>
          {publicEnv.contactEmail ? (
            <a
              href={`mailto:${publicEnv.contactEmail}`}
              className="type-body-small inline-flex min-h-10 items-center font-semibold [overflow-wrap:anywhere] text-lavender-700 underline-offset-4 hover:underline"
            >
              {publicEnv.contactEmail}
            </a>
          ) : (
            <p className="type-body-small text-foreground/65">L’ouverture au public est en préparation.</p>
          )}
        </div>
      </Container>
      <div className="border-t border-lavender-100">
        <Container className="type-meta flex flex-col gap-2 pb-2 pt-6 text-foreground/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} BeautIzzy</p>
          <p>Captures et figures présentées : données de démonstration fictives.</p>
        </Container>
        <Container className="pb-6">
          <p className="type-meta max-w-3xl text-foreground/60">{trademarkNotice(availability)}</p>
        </Container>
      </div>
    </footer>
  );
}

export { SiteFooter };
