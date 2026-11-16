import type { CSSProperties } from "react";

import { DemoScene } from "@/components/motion/demo-scene";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

import { Closeup, DemoNote, SectionHeading, TrueList } from "./building-blocks";
import { SCREENS } from "./screens";

const HOUR = 104; // px per hour in the demonstration
const START = 9 * 60; // 09:00
const top = (minutes: number) => ((minutes - START) / 60) * HOUR;
const at = (hours: number, minutes = 0) => hours * 60 + minutes;
const delay = (ms: number, length?: number) => ({ "--d": `${ms}ms`, ...(length ? { "--t": `${length}ms` } : {}) }) as CSSProperties;

type Palette = "peach" | "aqua" | "sky";

const PALETTES: Record<Palette, { bg: string; accent: string; title: string }> = {
  peach: { bg: "var(--bz-card-peach-bg)", accent: "var(--bz-card-peach-accent)", title: "var(--bz-card-peach-title)" },
  aqua: { bg: "var(--bz-card-aqua-bg)", accent: "var(--bz-card-aqua-accent)", title: "var(--bz-card-aqua-title)" },
  sky: { bg: "var(--bz-card-sky-bg)", accent: "var(--bz-card-sky-accent)", title: "var(--bz-card-sky-title)" },
};

/**
 * Appointments are made of phases. The demonstration replays the Agenda of
 * the demo data (its real screen is in the hero): Inès's colouring —
 * application 09:00, 35 min of processing, reprise 10:05 — then the
 * professional adds Hugo with « + » in the free interval. BeautIzzy never
 * places anyone by itself; overlaps are the professional's decision.
 */
export function AgendaSection() {
  return (
    <section id="agenda" aria-labelledby="agenda-title" className="scroll-mt-24 bg-[linear-gradient(180deg,#fff,var(--bz-peach-50)_170%)] py-16 lg:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14">
        <Reveal className="flex flex-col gap-7">
          <SectionHeading
            id="agenda-title"
            eyebrow="Agenda"
            title={
              <>
                Des rendez-vous qui suivent <em>votre façon de travailler.</em>
              </>
            }
            lead="Une coloration, un balayage ou une dépose ne sont pas des blocs : BeautIzzy les découpe en phases. Pendant un temps de pose, vous êtes libre — et vous pouvez y placer quelqu’un d’autre."
          />
          <TrueList
            items={[
              "Des prestations en phases : application, temps de pose, reprise.",
              "Vue jour et vue semaine ; des rendez-vous qui se chevauchent quand vous le choisissez.",
              "Des indisponibilités protégées : aucun rendez-vous ne s’y glisse.",
              "Acomptes, remises et rappels par e-mail à vos clients.",
            ]}
          />
          <p className="type-body-small text-foreground/65">BeautIzzy ne place rien à votre place : chaque rendez-vous reste votre décision.</p>
        </Reveal>

        <DemoScene label="un temps de pose dans l’Agenda" className="flex flex-col gap-5" replayClassName="right-4 top-4">
          <div className="rounded-[1.75rem] bg-background p-5 pt-6 shadow-lifted ring-1 ring-border/70 sm:p-7">
            <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-24">
              <p className="type-label whitespace-nowrap">Lundi 16 nov. · vue jour</p>
              <p className="type-meta text-foreground/55">Démonstration · données fictives</p>
            </div>

            <div className="relative" style={{ height: HOUR * 3.15 }}>
              {[9, 10, 11, 12].map((hour) => (
                <div key={hour} className="absolute inset-x-0 border-t border-border/80 sm:right-[10rem]" style={{ top: top(at(hour)) }}>
                  <span className="type-meta absolute -top-2.5 left-0 bg-background pr-2 tabular-nums text-foreground/55">{String(hour).padStart(2, "0")}:00</span>
                </div>
              ))}

              {/* The processing time of Inès's colouring: an annotation of the demonstration (the Agenda shows it as free time). */}
              <div
                aria-hidden="true"
                className="da da-grow da-grow-down absolute left-14 right-3 rounded-xl border-2 border-dashed border-peach-700/45 bg-peach-50 sm:left-16 sm:right-[10.5rem]"
                style={{ top: top(at(9, 30)) + 2, height: top(at(10, 5)) - top(at(9, 30)) - 4, ...delay(800, 700) }}
              />
              <div className="absolute right-0 hidden w-40 sm:block" style={{ top: top(at(9, 30)) + 4 }}>
                <p className="da da-fade type-label text-peach-700" style={delay(1150)}>
                  Temps de pose
                </p>
                <p className="da da-fade type-meta text-peach-700/85" style={delay(1350)}>
                  35 min · vous êtes libre
                </p>
                <p className="da da-fade type-meta mt-2 font-semibold text-[var(--bz-card-aqua-title)]" style={delay(3300)}>
                  → Hugo, ajouté par vous
                </p>
              </div>

              <AgendaCard who="Inès Pivoine" initials="IP" what="Coloration · Application" from={at(9)} to={at(9, 30)} palette="peach" className="da da-rise" style={delay(150)} />
              <AgendaCard who="Inès Pivoine" initials="IP" what="Coloration · Reprise" from={at(10, 5)} to={at(10, 35)} palette="peach" className="da da-rise" style={delay(1650)} />
              <AgendaCard who="Hugo Romarin" initials="HR" what="Coupe homme" from={at(9, 30)} to={at(10)} palette="aqua" className="da da-slide" style={delay(2850, 900)} />
              <AgendaCard who="Sofia Jasmin" initials="SJ" what="Coupe + brushing" from={at(10, 45)} to={at(11, 30)} palette="sky" />

              {/* « + » — the professional adds the appointment: said in words, never implied. */}
              <span
                className="da da-fade type-meta absolute bottom-3 right-16 rounded-full bg-[var(--bz-card-aqua-bg)] px-2.5 py-1 font-semibold text-[var(--bz-card-aqua-title)] sm:right-[14.75rem]"
                style={delay(2250, 400)}
              >
                Vous ajoutez un rendez-vous
              </span>
              <span
                aria-hidden="true"
                className="da da-tap da-touch absolute bottom-0 right-1 grid size-12 place-items-center rounded-full bg-background text-accent shadow-lifted ring-1 ring-border/70 sm:right-[11rem]"
                style={delay(2350, 900)}
              >
                <PlusIcon size={22} />
              </span>
            </div>
            <p className="da da-fade type-meta mt-4 text-peach-700 sm:hidden" style={delay(1350)}>
              Entre l’application et la reprise : 35 min de temps de pose. Vous y avez ajouté Hugo.
            </p>
          </div>

          <figure className="da da-rise ml-auto w-full max-w-[26rem] overflow-hidden rounded-[1.5rem] bg-background shadow-card ring-1 ring-border/70" style={delay(4100)}>
            <Closeup screen={SCREENS.rendezVousPhases} region={{ y: 0.43, h: 0.57 }} sizes="(min-width: 1024px) 420px, 92vw" />
            <figcaption className="type-meta border-t border-border/70 px-4 py-3 text-foreground/65">
              Dans l’application : le même rendez-vous, ses trois phases et leurs durées.
            </figcaption>
          </figure>
        </DemoScene>
      </Container>
      <Container>
        <DemoNote className="mt-6 text-center lg:text-right">Démonstration animée de l’Agenda et capture réelle du détail d’un rendez-vous · données fictives</DemoNote>
      </Container>
    </section>
  );
}

function AgendaCard({
  who,
  initials,
  what,
  from,
  to,
  palette,
  className,
  style,
}: {
  who: string;
  initials: string;
  what: string;
  from: number;
  to: number;
  palette: Palette;
  className?: string;
  style?: CSSProperties;
}) {
  const colors = PALETTES[palette];
  return (
    <div
      className={cn("absolute left-14 right-3 flex items-center gap-2.5 overflow-hidden rounded-xl py-1 pl-3 pr-3 sm:left-16 sm:right-[10.5rem]", className)}
      style={{ top: top(from) + 2, height: top(to) - top(from) - 4, background: colors.bg, boxShadow: `inset 3px 0 0 ${colors.accent}`, ...style }}
    >
      <span aria-hidden="true" className="hidden size-8 shrink-0 place-items-center rounded-full bg-background text-[0.7rem] font-semibold sm:grid" style={{ color: colors.title }}>
        {initials}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[0.875rem] font-bold" style={{ color: colors.title }}>
          {who}
        </span>
        <span className="block truncate text-[0.8125rem]" style={{ color: colors.accent }}>
          {what}
        </span>
      </span>
    </div>
  );
}
