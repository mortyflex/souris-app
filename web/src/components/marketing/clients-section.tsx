import type { CSSProperties } from "react";

import { FeatureTour, type TourStep } from "@/components/motion/feature-tour";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";

import { Closeup, DemoNote, SectionHeading, TrueList, type ScreenRegion } from "./building-blocks";
import { SCREENS, type AppScreen } from "./screens";

/**
 * The client profile, as four real views of the same fictional client — their
 * file, activity, appointments and purchases — in one flat screen
 * viewport (no device: the detail is the subject). A segmented control
 * chooses; one guided pass plays when the section is first seen.
 */
const VIEWS: readonly { id: string; label: string; screen: AppScreen; region: ScreenRegion; caption: string }[] = [
  {
    id: "fiche",
    label: "Fiche",
    screen: SCREENS.clientFiche,
    region: { y: 0.03, h: 0.5 },
    caption: "Coordonnées, actions rapides et rappel d’anniversaire, le jour venu.",
  },
  {
    id: "activite",
    label: "Activité",
    screen: SCREENS.clientFiche,
    region: { y: 0.5, h: 0.5 },
    caption: "Son prochain rendez-vous, ses rendez-vous réalisés, son total dépensé.",
  },
  {
    id: "historique",
    label: "Historique",
    screen: SCREENS.clientHistorique,
    region: { y: 0, h: 1 },
    caption: "L’historique de ses rendez-vous, avec la prestation et le montant.",
  },
  {
    id: "achats",
    label: "Achats",
    screen: SCREENS.clientAchats,
    region: { y: 0.25, h: 0.5 },
    caption: "Ses achats de produits, et la note que vous avez prise.",
  },
];

export function ClientsSection() {
  const steps: TourStep[] = VIEWS.map((view) => ({
    id: view.id,
    label: view.label,
    panel: (
      <figure className="flex flex-col gap-3">
        <div className="tour-part aspect-[1.06] overflow-hidden rounded-[1.5rem] bg-[#f4f2f8] ring-1 ring-border/70" style={{ "--i": 0 } as CSSProperties}>
          <Closeup screen={view.screen} region={view.region} sizes="(min-width: 1024px) 460px, 92vw" />
        </div>
        <figcaption className="tour-part type-body-small px-1 text-foreground/70" style={{ "--i": 1 } as CSSProperties}>
          {view.caption}
        </figcaption>
      </figure>
    ),
  }));

  return (
    <section id="clientele" aria-labelledby="clients-title" className="scroll-mt-24 bg-[linear-gradient(180deg,var(--bz-lavender-25),#fff)] py-16 lg:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="order-2 mx-auto w-full max-w-[30rem] rounded-[2rem] bg-background p-4 shadow-lifted ring-1 ring-border/70 sm:p-5 lg:order-1">
          <FeatureTour steps={steps} label="La fiche client" variant="segmented" speed="quick" tabsPosition="before" />
        </div>

        <Reveal className="order-1 flex flex-col gap-7 lg:order-2">
          <SectionHeading
            id="clients-title"
            eyebrow="Clientèle"
            title={
              <>
                Chaque client, <em>toute son histoire.</em>
              </>
            }
            lead="Ses rendez-vous passés et à venir, ce qu’il a dépensé, ce qu’il a acheté, la note que vous avez prise : tout est sur sa fiche, sans rien ressaisir."
          />
          <TrueList
            items={[
              "Coordonnées, photo et une note libre pour chaque client.",
              "Historique des rendez-vous, total dépensé, achats de produits.",
              "Un rappel d’anniversaire, le jour venu et le jour de son rendez-vous.",
              "Importez votre fichier clients : les doublons sont repérés.",
            ]}
          />
          <DemoNote>Captures réelles de l’application · client fictif</DemoNote>
        </Reveal>
      </Container>
    </section>
  );
}
