import type { Metadata } from "next";
import { Bodoni_Moda, Manrope } from "next/font/google";

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

// Display: the optical-size axis is kept, so hairlines refine as a heading grows.
const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni-moda",
  subsets: ["latin"],
  axes: ["opsz"],
});

// Display italic, for an emphasized word in a display heading only. Not
// preloaded: the file downloads on the pages that actually set one.
const bodoniModaItalic = Bodoni_Moda({
  variable: "--font-bodoni-moda-italic",
  subsets: ["latin"],
  style: "italic",
  axes: ["opsz"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${manrope.variable} ${bodoniModa.variable} ${bodoniModaItalic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
