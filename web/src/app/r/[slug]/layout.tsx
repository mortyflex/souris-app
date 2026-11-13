import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Container } from "@/components/ui/container";

// Booking pages are placeholders: keep them out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Shell of the public booking pages: lighter than the marketing shell, no marketing navigation. */
export default function BookingLayout({ children }: LayoutProps<"/r/[slug]">) {
  return (
    <>
      <header className="border-b border-border/70">
        <Container className="flex h-16 items-center">
          <Link href="/" aria-label="BeautIzzy — accueil" className="rounded-md">
            <BrandLogo priority />
          </Link>
        </Container>
      </header>
      <main className="flex-1 py-10 sm:py-16">
        <Container className="max-w-3xl">{children}</Container>
      </main>
    </>
  );
}
