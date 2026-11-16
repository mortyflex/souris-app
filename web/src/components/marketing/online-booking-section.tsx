import Image from "next/image";
import type { CSSProperties } from "react";

import { NacreCover } from "@/components/brand/nacre-cover";
import { FeatureTour, type TourStep } from "@/components/motion/feature-tour";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";

import { DemoNote, SectionHeading, TrueList } from "./building-blocks";
import { SCREENS, type AppScreen } from "./screens";

/** The customer's journey, captured from the website itself (a local build, a fictional profile). */
const STEPS: readonly { id: string; label: string; screen: AppScreen; caption: string }[] = [
  { id: "page", label: "Sa page", screen: SCREENS.webProfil, caption: "Votre page : votre nom, votre univers, vos coordonnées." },
  { id: "prestation", label: "Prestation", screen: SCREENS.webPrestation, caption: "Le client choisit une prestation, avec sa durée." },
  { id: "horaire", label: "Horaire", screen: SCREENS.webCreneaux, caption: "Puis un jour et un horaire réellement libres dans votre agenda." },
  { id: "recap", label: "Résumé", screen: SCREENS.webRecap, caption: "Il vérifie, puis confirme — sans créer de compte." },
];

/**
 * Online booking — said as it is: in preparation, not open to the public.
 * Every sentence is in the future tense; the screens are the website's own
 * pages on a fictional profile: one automatic pass when seen (choosing a
 * step stops it), then « Revoir ». A presentation only: nothing is sent, and
 * Turnstile is never loaded here.
 */
export function OnlineBookingSection() {
  const steps: TourStep[] = STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    icon: (
      <span aria-hidden="true" className="grid size-4 place-items-center rounded-full bg-lavender-100 text-[0.625rem] font-bold leading-none text-accent">
        {index + 1}
      </span>
    ),
    panel: (
      <figure className="flex flex-col gap-3">
        <div className="tour-part relative grid aspect-[0.8] place-items-center overflow-hidden rounded-[1.5rem] bg-[linear-gradient(180deg,#fbfaff,#f4f0fd)] shadow-lifted ring-1 ring-border/70" style={{ "--i": 0 } as CSSProperties}>
          <Image src={step.screen.image} alt={step.screen.alt} sizes="(min-width: 1024px) 380px, 88vw" placeholder="blur" className="block h-auto w-full" />
        </div>
        <figcaption className="tour-part type-body-small px-1 text-center text-foreground/70" style={{ "--i": 1 } as CSSProperties}>
          {step.caption}
        </figcaption>
      </figure>
    ),
  }));

  return (
    <section id="reservation-en-ligne" aria-labelledby="online-booking-title" className="scroll-mt-24 py-16 lg:py-24">
      <Container>
        <div className="relative isolate overflow-hidden rounded-[2.25rem] bg-lavender-25 ring-1 ring-lavender-100 lg:rounded-[2.75rem]">
          <div aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 hidden w-[48%] lg:block">
            <NacreCover animated={false} idPrefix="booking" />
          </div>
          <div className="grid items-center gap-10 p-5 sm:p-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:p-16">
            <Reveal className="flex flex-col gap-7">
              <span className="type-caption inline-flex w-fit items-center gap-2 rounded-full bg-background px-3 py-1.5 uppercase tracking-[0.12em] text-lavender-700 ring-1 ring-lavender-200">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                En préparation
              </span>
              <SectionHeading
                id="online-booking-title"
                eyebrow="Réservation en ligne"
                title={
                  <>
                    Bientôt, vos clients réserveront <em>directement dans votre agenda.</em>
                  </>
                }
                lead="Une page à votre nom, élégante et simple : vos clients y choisiront une prestation, un jour et un horaire, sans créer de compte."
              />
              <TrueList
                items={[
                  "Seuls les horaires compatibles avec vos heures d’ouverture et vos rendez-vous seront proposés.",
                  "Chaque réservation arrivera dans votre agenda, comme un rendez-vous que vous auriez pris.",
                  "Vos indisponibilités resteront à vous : personne ne pourra y réserver.",
                ]}
              />
              <p className="type-body-small rounded-2xl bg-background/80 px-4 py-3 text-foreground/75 ring-1 ring-border/70">
                La réservation en ligne n’est pas encore ouverte au public.
              </p>
            </Reveal>

            <div className="mx-auto w-full max-w-[24rem]">
              <FeatureTour steps={steps} label="Le parcours de réservation" mode="once" stepMs={3400} tabsPosition="before" />
            </div>
          </div>
        </div>
        <DemoNote className="mt-6 text-center">Captures du site BeautIzzy · établissement et horaires fictifs, aucune réservation envoyée</DemoNote>
      </Container>
    </section>
  );
}
