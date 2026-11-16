import type { CSSProperties } from "react";

import { DemoScene } from "@/components/motion/demo-scene";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { BagIcon, CheckIcon } from "@/components/ui/icons";

import { Closeup, DemoNote, Eyebrow, TrueList } from "./building-blocks";
import { SCREENS } from "./screens";

const delay = (ms: number, length?: number) => ({ "--d": `${ms}ms`, ...(length ? { "--t": `${length}ms` } : {}) }) as CSSProperties;

/** « Masque nourrissant » in the close-up of the product list (fractions of the close-up). */
const ROW = { top: "57%", height: "26%" } as const;

/**
 * Products and stock, on a full-width deep-violet band. The real product list
 * highlights one product; its panel opens; « Vendre ce produit », then
 * « Encaisser la vente » (the app's own wording); the stock goes 5 → 4 —
 * once, at the sale's completion (docs/domain/PRODUCTS.md §5). Nothing is
 * sent anywhere: the whole scene is a presentation.
 */
export function ProductsSection() {
  return (
    <section id="produits" aria-labelledby="products-title" className="relative isolate scroll-mt-24 overflow-hidden bg-foreground py-16 text-white lg:py-24">
      <div aria-hidden="true" className="absolute -right-40 -top-40 -z-10 size-[36rem] rounded-full bg-[radial-gradient(circle,rgb(115_84_199/0.45),transparent_65%)]" />
      <div aria-hidden="true" className="absolute -bottom-48 -left-32 -z-10 size-[30rem] rounded-full bg-[radial-gradient(circle,rgb(225_214_249/0.16),transparent_65%)]" />
      <Container className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <Reveal className="flex flex-col gap-7">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow className="text-lavender-200">Produits &amp; stock</Eyebrow>
            <h2 id="products-title" className="type-headline text-white [&_em]:italic [&_em]:text-lavender-200">
              Votre revente, <em>sans tableur.</em>
            </h2>
            <p className="type-lead text-white/75">Shampoings, vernis, soins : votre catalogue tient dans votre poche. Une vente met votre stock à jour toute seule.</p>
          </div>
          <TrueList
            className="text-white/80 [&_svg]:text-lavender-200"
            items={[
              "Nom, marque, catégorie, prix, photo et code-barres de chaque produit.",
              "Scannez un code-barres pour retrouver un produit ou l’ajouter à une vente.",
              "Vendez seul ou pendant un rendez-vous : le stock baisse à l’encaissement.",
              "Les produits épuisés restent visibles, clairement signalés.",
            ]}
          />
        </Reveal>

        <DemoScene label="une vente et son stock" tone="dark" className="grid gap-4 sm:grid-cols-[1.05fr_0.95fr] sm:items-start" replayClassName="-top-14 right-0">
          {/* The real list, one product highlighted. */}
          <figure className="da da-rise relative overflow-hidden rounded-[1.5rem] bg-background shadow-[0_30px_60px_rgba(0,0,0,0.35)]" style={delay(0, 700)}>
            <Closeup screen={SCREENS.produitsListe} region={{ y: 0, h: 0.62 }} sizes="(min-width: 1024px) 360px, 92vw" />
            <span aria-hidden="true" className="absolute inset-x-2 rounded-xl" style={{ top: ROW.top, height: ROW.height }}>
              <span className="da da-fade da-ring absolute inset-1.5 rounded-xl" style={delay(650, 700)} />
              <span className="da-touch absolute right-[22%] top-1/2 size-0" style={delay(900, 900)} />
            </span>
            <figcaption className="sr-only">Capture réelle du catalogue de produits.</figcaption>
          </figure>

          {/* The product, then the sale — a reproduction of the two steps. */}
          <div className="da da-slide flex flex-col gap-3 sm:mt-10" style={delay(1150, 900)}>
            <div className="rounded-[1.5rem] bg-background p-5 text-foreground shadow-[0_30px_60px_rgba(0,0,0,0.35)]">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-lavender-50 text-accent">
                  <BagIcon size={20} />
                </span>
                <div className="min-w-0">
                  <p className="font-bold leading-tight">Masque nourrissant</p>
                  <p className="type-meta text-foreground/60">Marque Démo · Soins</p>
                </div>
                <p className="ml-auto font-bold tabular-nums">24,00&nbsp;€</p>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-surface px-3.5 py-2.5">
                <span className="type-label text-foreground/70">Stock</span>
                <span className="relative inline-grid h-7 min-w-10 place-items-center overflow-hidden rounded-full bg-lavender-50 px-3 text-[1rem] font-bold tabular-nums text-accent">
                  <span aria-hidden="true" className="da da-leave col-start-1 row-start-1" style={delay(3150)}>
                    5
                  </span>
                  <span className="da da-arrive col-start-1 row-start-1" style={delay(3250)}>
                    4
                  </span>
                </span>
              </div>
              <span aria-hidden="true" className="da da-tap da-touch mt-4 flex min-h-11 items-center justify-center rounded-full bg-accent text-[0.95rem] font-semibold text-white" style={delay(1900, 800)}>
                Vendre ce produit
              </span>
            </div>

            <div className="da da-rise rounded-[1.5rem] bg-background p-5 text-foreground shadow-[0_30px_60px_rgba(0,0,0,0.35)]" style={delay(2350)}>
              <div className="flex items-center justify-between text-[0.92rem]">
                <span>
                  1 × Masque nourrissant
                </span>
                <span className="font-bold tabular-nums">24,00&nbsp;€</span>
              </div>
              <div className="mt-3 flex gap-2 text-[0.8rem] font-semibold">
                <span className="rounded-full bg-lavender-100 px-3 py-1.5 text-accent ring-1 ring-accent/40">Carte</span>
                <span className="rounded-full bg-surface px-3 py-1.5 text-foreground/60">Espèces</span>
              </div>
              <span aria-hidden="true" className="da da-tap da-touch mt-4 flex min-h-11 items-center justify-center rounded-full bg-accent text-[0.95rem] font-semibold text-white" style={delay(2800, 800)}>
                Encaisser la vente
              </span>
            </div>

            <p className="da da-pop flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-[0.88rem] font-semibold text-foreground shadow-lifted" style={delay(3350, 520)}>
              <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-[var(--bz-receipt-collected)] text-white">
                <CheckIcon size={14} />
              </span>
              Encaissé · 24,00&nbsp;€ · stock à jour
            </p>
          </div>
        </DemoScene>
      </Container>
      <Container>
        <DemoNote className="mt-8 text-center text-white/55 lg:text-right">Capture réelle du catalogue et reproduction animée d’une vente · produits et marques de démonstration</DemoNote>
      </Container>
    </section>
  );
}
