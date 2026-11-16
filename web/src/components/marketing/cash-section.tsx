import type { CSSProperties } from "react";

import { NacreCover } from "@/components/brand/nacre-cover";
import { DemoNumber } from "@/components/motion/demo-number";
import { DemoScene } from "@/components/motion/demo-scene";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { ReceiptIcon } from "@/components/ui/icons";

import { Closeup, DemoNote, PrinterCapsule, ReceiptPaper, SectionHeading, TearLine, TrueList } from "./building-blocks";
import { SCREENS } from "./screens";

const delay = (ms: number, length?: number) => ({ "--d": `${ms}ms`, ...(length ? { "--t": `${length}ms` } : {}) }) as CSSProperties;

/** The day of the demo data, as « Résumé du jour » prints it (src/features/agenda/day-summary). */
const LINES = [
  { time: "09:00", service: "Coloration", client: "Inès Pivoine", amount: "68,00 €" },
  { time: "09:30", service: "Coupe homme", client: "Hugo Romarin", amount: "26,00 €" },
  { time: "11:00", service: "Coupe + brushing", client: "Sofia Jasmin", amount: "62,00 €" },
  { time: "14:30", service: "Balayage + Patine", client: "Nadia Orchidée", amount: "155,00 €" },
  { time: "17:30", service: "Brushing", client: "Camille Bleuet", amount: "28,00 €" },
] as const;

const FEED = 280; // the capsule lands, then the paper feeds (receiptPrint: 160 + 120 ms)
const LINES_START = 1750;

/**
 * Two different things, never confused: « Résumé du jour » — the day's
 * appointments, what they are worth and what is left to collect, printed like
 * a receipt from its capsule (a reproduction, as in the app: the paper is the
 * object, it feeds out in one second and settles) — and the Caisse, which
 * counts the money actually received (a real screen).
 */
export function CashSection() {
  return (
    <section id="caisse" aria-labelledby="cash-title" className="scroll-mt-24 py-16 lg:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
        <DemoScene label="le Résumé du jour et la Caisse" className="order-2 lg:order-1" replayClassName="right-3 top-3 sm:right-5 sm:top-5">
          <div className="relative overflow-hidden rounded-[2.25rem] px-4 pb-8 pt-8 ring-1 ring-lavender-200/70 sm:px-5 lg:rounded-[2.75rem]">
            <div aria-hidden="true" className="absolute inset-0 -z-10">
              <NacreCover animated={false} idPrefix="cash" />
            </div>

            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center sm:gap-3">
              {/* The printer: capsule, then the paper fed out of its groove. */}
              <div className="w-full max-w-[17rem] shrink-0">
                <PrinterCapsule className="da da-drop relative z-10 -mx-2.5" lightClassName="da da-fade" />
                <div className="-mt-[11px] overflow-hidden px-px pb-10">
                  <div className="da da-feed" style={delay(FEED)}>
                    <ReceiptPaper>
                      <div className="flex flex-col items-center gap-1 text-center">
                        <span aria-hidden="true" className="mb-1 grid size-10 place-items-center rounded-full bg-lavender-50 text-accent">
                          <ReceiptIcon size={20} />
                        </span>
                        <p className="text-[1.1rem] font-bold">Résumé du jour</p>
                        <p className="type-label text-accent">Lundi 16 novembre</p>
                        <p className="type-meta text-foreground/60">5 rendez-vous</p>
                      </div>
                      <TearLine />
                      <ul className="flex flex-col gap-2.5">
                        {LINES.map((line, index) => (
                          <li key={line.time} className="da-mark grid grid-cols-[2.3rem_1fr_auto] items-center gap-2" style={delay(LINES_START + index * 150, 1000)}>
                            <span className="text-[0.72rem] font-semibold tabular-nums text-foreground/75">{line.time}</span>
                            <span className="min-w-0 leading-tight">
                              <span className="block text-[0.88rem] font-semibold">{line.service}</span>
                              <span className="block truncate text-[0.78rem] text-foreground/60">{line.client}</span>
                            </span>
                            <span className="text-[0.88rem] font-bold tabular-nums">{line.amount}</span>
                          </li>
                        ))}
                      </ul>
                      <TearLine />
                      <div className="da-flash rounded-xl bg-lavender-50 px-3 py-3 text-center" style={delay(2600, 1200)}>
                        <p className="type-caption uppercase tracking-[0.12em] text-accent">CA potentiel</p>
                        <DemoNumber value={339} format="euros-cents" delay={2550} duration={1000} className="block text-[1.9rem] font-bold leading-tight text-[var(--bz-lavender-700)]" />
                      </div>
                      <dl className="mt-3 flex flex-col gap-1.5 text-[0.9rem]">
                        {[
                          ["Déjà encaissé", "0,00 €", "text-[var(--bz-receipt-collected)]"],
                          ["Reste à encaisser", "339,00 €", ""],
                          ["Temps total", "6 h 20 min", ""],
                          ["Panier moyen", "67,80 €", ""],
                        ].map(([label, value, tone], index) => (
                          <div key={label} className="da da-fade flex justify-between gap-3" style={delay(3150 + index * 110, 500)}>
                            <dt className="text-foreground/70">{label}</dt>
                            <dd className={`font-semibold tabular-nums ${tone}`}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="type-meta mt-3 text-center text-foreground/55">Un récapitulatif de la journée, pas un reçu de paiement.</p>
                    </ReceiptPaper>
                  </div>
                </div>
              </div>

              {/* The Caisse: the money actually received this month — the real screen. */}
              <figure className="da da-slide relative z-10 w-full min-w-0 max-w-[17rem] sm:mt-28 sm:flex-1" style={delay(3700, 900)}>
                <div className="da-flash overflow-hidden rounded-[1.5rem] bg-background shadow-lifted ring-1 ring-border/70" style={delay(4400, 1300)}>
                  <Closeup screen={SCREENS.caisseMois} region={{ y: 0.375, h: 0.354 }} sizes="(min-width: 1024px) 272px, 80vw" />
                  <figcaption className="type-meta border-t border-border/70 px-4 py-3 text-foreground/65">
                    La Caisse, ce mois-ci : l’argent réellement encaissé.
                  </figcaption>
                </div>
              </figure>
            </div>
          </div>
        </DemoScene>

        <Reveal className="order-1 flex flex-col gap-7 lg:order-2">
          <SectionHeading
            id="cash-title"
            eyebrow="Caisse"
            title={
              <>
                Une caisse claire, <em>du premier encaissement au résumé du soir.</em>
              </>
            }
            lead="La Caisse compte chaque euro reçu : rendez-vous, ventes de produits, acomptes. Et le soir, le Résumé du jour récapitule vos rendez-vous et ce qu’il reste à encaisser."
          />
          <TrueList
            items={[
              "Encaissez rendez-vous et ventes de produits, par carte ou en espèces.",
              "Acomptes, remises, remboursements et corrections — sans jamais réécrire l’historique.",
              "Vos encaissements du jour et du mois, avec l’évolution par rapport au mois précédent.",
              "Le Résumé du jour et de la semaine, présenté comme un ticket.",
            ]}
          />
          <DemoNote>Reproduction animée du Résumé du jour et capture réelle de la Caisse · données fictives</DemoNote>
        </Reveal>
      </Container>
    </section>
  );
}
