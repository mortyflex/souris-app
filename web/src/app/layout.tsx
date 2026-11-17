import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";

import { siteRobots } from "@/lib/env/indexing";
import { site } from "@/lib/site";

import "./globals.css";

// The brand typography (src/styles/typography.css, docs/design/BRAND_TYPOGRAPHY.md).
// Both are variable fonts, self-hosted at build time: no request to a font CDN.
// The `latin` subset covers French (é è ê ë à â î ï ô û ù ç œ Œ « » €) and is
// preloaded; rarer accents (latin-ext) download only when a page uses them.

// Text: one variable file carries every weight the site uses (400–700).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// Display: the weight axis only. Fraunces' other axes stay at Google Fonts'
// defaults and are never downloaded — optical size 14 (a sturdy cut at every
// size, on every screen), SOFT 0 (sharp serifs), WONK 0 (no wonky letters).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

// Display italic, for an emphasized word in a display heading only. Not
// preloaded: the file downloads on the pages that actually set one.
const frauncesItalic = Fraunces({
  variable: "--font-fraunces-italic",
  subsets: ["latin"],
  style: "italic",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  // Only the production website may be indexed (src/lib/env/indexing.ts).
  robots: siteRobots(),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${manrope.variable} ${fraunces.variable} ${frauncesItalic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
