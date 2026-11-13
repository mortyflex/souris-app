import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

const NAV_LINKS = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#reservation-en-ligne", label: "Réservation en ligne" },
] as const;

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="BeautIzzy — accueil" className="rounded-md">
          <BrandLogo priority />
        </Link>
        <nav aria-label="Navigation principale" className="flex items-center gap-1 sm:gap-2">
          {NAV_LINKS.map((link) => (
            <Button key={link.href} asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
          <Button asChild>
            <Link href="/#fonctionnalites">Découvrir</Link>
          </Button>
        </nav>
      </Container>
    </header>
  );
}

export { SiteHeader };
