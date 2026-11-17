import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

import { NacreCover } from "@/components/brand/nacre-cover";
import { DemoScene } from "@/components/motion/demo-scene";
import { PauseOffscreen } from "@/components/motion/pause-offscreen";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { EyeOffIcon, ImageSaveIcon, ShareIcon } from "@/components/ui/icons";

import { DemoNote, PrinterCapsule, SectionHeading, TrueList } from "./building-blocks";
import { PodiumDemo } from "./podium-demo";
import { SCREENS } from "./screens";

const delay = (ms: number, length?: number) => ({ "--d": `${ms}ms`, ...(length ? { "--t": `${length}ms` } : {}) }) as CSSProperties;

/** After the podium (≈ 3.5 s): the ticket's actions, then — separately — the image it exports. */
const SHARE = { actions: 3700, card: 4250, badge: 5150 } as const;

/**
 * Tops & tendances — the signature: the podium of the month on its ticket,
 * then what the professional can do with it, exactly as the app does it:
 * « Enregistrer l’image » straight to Photos (« Image enregistrée dans
 * Photos »), « Partager » through the phone's own share sheet. The card shown
 * is the GENUINE image the app exported — « Top prestations »: services, not
 * clients; the turnover frosted, as on every exported card.
 */
export function TrendsSection() {
  return (
    <section id="tendances" aria-labelledby="trends-title" className="scroll-mt-24 bg-lavender-25 py-16 lg:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14">
        <Reveal className="flex flex-col gap-7">
          <SectionHeading
            id="trends-title"
            eyebrow="Tops & tendances"
            title={
              <>
                Vos meilleurs clients, <em>vos prestations phares.</em>
              </>
            }
            lead="Qui dépense le plus ? Qui revient le plus souvent ? Quelles prestations et quels produits portent votre mois ? Les réponses tiennent sur un ticket — et vos temps forts, sur une image."
          />
          <TrueList
            items={[
              "Les clients qui dépensent le plus, et les plus fidèles.",
              "Le top de vos prestations et de vos produits, par jour, semaine, mois ou année.",
              "Les montants de vos clients masqués à chaque ouverture, affichés d’un geste.",
              "Vos temps forts en image, à enregistrer dans Photos ou à partager depuis votre téléphone.",
            ]}
          />
          <p className="type-body-small rounded-2xl bg-background/80 px-4 py-3 text-foreground/70 ring-1 ring-border/70">
            Sur l’image, votre chiffre d’affaires reste flouté. Pour un partage public, privilégiez vos prestations ou vos produits
            phares : un classement de clients ne se publie qu’avec leur accord.
          </p>
        </Reveal>

        <div className="relative">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-[2.25rem] ring-1 ring-lavender-200/70 lg:rounded-[2.75rem]">
            <NacreCover idPrefix="tops" />
            <PauseOffscreen />
          </div>
          <DemoScene
            label="le podium de Tops et tendances, et son image"
            className="relative grid justify-items-center gap-6 px-4 pb-8 pt-20 sm:grid-cols-[minmax(0,20.5rem)_minmax(0,12rem)] sm:items-end sm:justify-center sm:gap-5 sm:px-5 sm:pt-6"
            replayClassName="right-4 top-4"
          >
            {/* 1 · The ticket: the clients' ranking — fictional amounts written and counting up; the eye masks them (the app masks them at every opening). */}
            <div className="flex w-full max-w-[20.5rem] flex-col items-center">
              <p className="type-caption mb-3 rounded-full bg-background/85 px-3 py-1.5 uppercase tracking-[0.12em] text-lavender-700 ring-1 ring-lavender-200">
                Le ticket · vos clients
              </p>
              <PrinterCapsule className="da da-drop relative z-10 -mx-2.5 w-[calc(100%+20px)]" />
              <div className="-mt-[11px] w-full overflow-hidden px-px pb-8">
                <div className="da da-feed" style={delay(120)}>
                  <PodiumDemo />
                </div>
              </div>
              <div className="-mt-2 flex gap-6">
                <GlassAction label="Enregistrer" spoken="Enregistrer l’image" className="da da-rise" style={delay(SHARE.actions)}>
                  <ImageSaveIcon size={21} />
                </GlassAction>
                <GlassAction label="Partager" spoken="Partager" className="da da-rise" style={delay(SHARE.actions + 110)}>
                  <ShareIcon size={21} />
                </GlassAction>
              </div>
            </div>

            {/* 2 · A shareable image: another page of the ticket, the one the app really exported. */}
            <figure className="da da-slide flex w-full max-w-[13rem] flex-col items-center gap-3 sm:mb-24" style={delay(SHARE.card, 1000)}>
              <p className="type-caption rounded-full bg-background/85 px-3 py-1.5 uppercase tracking-[0.12em] text-lavender-700 ring-1 ring-lavender-200">
                L’image · Top prestations
              </p>
              <div className="relative w-full">
                <div className="overflow-hidden rounded-[1.4rem] shadow-[0_24px_48px_rgba(31,28,61,0.22)] ring-1 ring-border/60">
                  <Image src={SCREENS.shareTopsPrestations.image} alt={SCREENS.shareTopsPrestations.alt} sizes="208px" placeholder="blur" className="block h-auto w-full" />
                </div>
                <span
                  aria-hidden="true"
                  className="da da-pop absolute -right-3 -top-3 grid size-11 place-items-center rounded-full bg-accent text-white shadow-lifted ring-4 ring-background"
                  style={delay(SHARE.badge, 560)}
                >
                  <ShareIcon size={18} />
                </span>
              </div>
              <figcaption className="type-meta text-center text-foreground/70">
                Aperçu prêt à enregistrer ou partager : vos prestations phares, pas vos clients, et un chiffre d’affaires flouté.
              </figcaption>
            </figure>
          </DemoScene>
          <p className="type-meta relative mx-auto -mt-2 mb-2 flex w-fit items-center gap-2 rounded-full bg-background/90 px-3.5 py-2 font-semibold text-lavender-700 shadow-card ring-1 ring-lavender-200">
            <EyeOffIcon size={15} />
            Essayez : l’œil affiche ou masque les montants de vos clients
          </p>
        </div>
      </Container>
      <Container>
        <DemoNote className="mt-6 text-center lg:text-right">
          Reproduction animée de Tops &amp; tendances et image réellement exportée par l’application · données fictives
        </DemoNote>
      </Container>
    </section>
  );
}

/**
 * The compact glass buttons under the ticket (the app's `GlassIconButton`):
 * a demonstration here, so not a control — the label under each one says
 * what it does.
 */
function GlassAction({
  label,
  spoken,
  children,
  className,
  style,
}: {
  label: string;
  spoken: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`flex flex-col items-center gap-1.5 ${className ?? ""}`} style={style}>
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-[linear-gradient(180deg,#fff,#f6f3fc)] text-accent shadow-[0_8px_20px_rgba(31,28,61,0.16)] ring-1 ring-border/60"
      >
        {children}
      </span>
      <span className="type-meta font-semibold text-foreground/70">
        {label}
        {spoken !== label ? <span className="sr-only"> ({spoken})</span> : null}
      </span>
    </span>
  );
}
