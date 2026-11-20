import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Container } from "@/components/ui/container";
import { contactHref } from "@/lib/site";

export type PublicFooterVariant = "profile" | "flow";

interface FooterLink {
  readonly href: string;
  readonly label: string;
}

const linkClass =
  "type-body-small inline-flex min-h-10 items-center text-foreground/70 transition-colors duration-[var(--bz-duration-state)] hover:text-lavender-700";

/**
 * The footer of the public booking pages — a professional's page and the
 * booking flow. Lighter than the website's footer: the wordmark carries it,
 * the words stay quiet, and only links to what exists.
 *
 *   - « Réservation en ligne avec » BeautIzzy;
 *   - profile: « Pour les professionnels » (the BeautIzzy website), as in the
 *     desktop header — never in the booking flow, where nothing pulls a
 *     customer out of a booking in progress;
 *   - « Contacter BeautIzzy », only when the website has a contact address;
 *   - the legal pages (legal notice, privacy, booking terms) are not written
 *     yet: their links join this list when the routes exist — never a dead link.
 */
export function PublicFooter({ variant }: { variant: PublicFooterVariant }) {
  const contact = contactHref();
  const links: FooterLink[] = [
    ...(variant === "profile" ? [{ href: "/", label: "Pour les professionnels" }] : []),
    ...(contact ? [{ href: contact, label: "Contacter BeautIzzy" }] : []),
  ];

  return (
    <footer className="border-t border-lavender-100 bg-[linear-gradient(180deg,#fff,var(--bz-lavender-25))]">
      <Container className="flex flex-col items-center gap-6 pb-8 pt-10 text-center md:flex-row md:items-end md:justify-between md:gap-10 md:py-9 md:text-left">
        <p className="flex flex-col items-center gap-1.5 md:items-start">
          <span className="type-meta text-foreground/55">Réservation en ligne avec</span>
          <BrandLogo className="h-9" sizes="100px" />
        </p>
        <div className="flex flex-col items-center gap-3 md:flex-row md:gap-8">
          {links.length > 0 ? (
            <nav aria-label="Liens BeautIzzy">
              <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-0.5">
                {links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("/") ? (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className={linkClass}>
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <p className="type-meta whitespace-nowrap text-foreground/55">© {new Date().getFullYear()} BeautIzzy</p>
        </div>
      </Container>
    </footer>
  );
}
