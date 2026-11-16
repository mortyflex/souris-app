import type { CSSProperties, ReactNode } from "react";

import { NacreCover } from "@/components/brand/nacre-cover";
import { FeatureTour, type TourStep } from "@/components/motion/feature-tour";
import { PauseOffscreen } from "@/components/motion/pause-offscreen";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { BagIcon, CalendarIcon, ChartIcon, FaceIcon, LeafIcon, NailIcon, ReceiptIcon, ScissorsIcon, UserIcon } from "@/components/ui/icons";
import { contactHref } from "@/lib/site";
import { storeAvailability, type StoreAvailability } from "@/lib/stores";

import { Closeup, DemoNote, DeviceFrame, Eyebrow, type ScreenRegion } from "./building-blocks";
import { SCREENS, type AppScreen } from "./screens";
import { PendingPlatforms, StoreBadges } from "./store-links";

const PROFESSIONS = [
  { label: "Coiffure", Icon: ScissorsIcon },
  { label: "Ongles", Icon: NailIcon },
  { label: "Esthétique", Icon: FaceIcon },
  { label: "Bien-être", Icon: LeafIcon },
] as const;

/**
 * Five modules, five real screens: every close-up is a region of an authentic
 * capture (1.3 : 1), every figure is the demo's own (fictional) data as the
 * screen shows it — Accueil, Caisse, the client profile, Produits, Tops.
 */
const MODULES: readonly {
  id: string;
  tab: string;
  name: string;
  icon: ReactNode;
  screen: AppScreen;
  region: ScreenRegion;
  figure: string;
  detail: string;
}[] = [
  {
    id: "agenda",
    tab: "Agenda",
    name: "Agenda",
    icon: <CalendarIcon size={16} />,
    screen: SCREENS.agendaDay,
    region: { y: 0.29, h: 0.395 },
    figure: "5 rendez-vous aujourd’hui",
    detail: "339 € de chiffre d’affaires potentiel, prestation par prestation.",
  },
  {
    id: "caisse",
    tab: "Caisse",
    name: "Caisse",
    icon: <ReceiptIcon size={16} />,
    screen: SCREENS.caisseMois,
    region: { y: 0.375, h: 0.354 },
    figure: "416,30 € encaissés",
    detail: "Ce mois-ci, par carte et en espèces, comparés au mois précédent.",
  },
  {
    id: "clientele",
    tab: "Clientèle",
    name: "Clientèle",
    icon: <UserIcon size={16} />,
    screen: SCREENS.clientFiche,
    region: { y: 0.155, h: 0.444 },
    figure: "Chaque fiche, toute une histoire",
    detail: "Coordonnées, anniversaire, rendez-vous, dépenses et achats.",
  },
  {
    id: "produits",
    tab: "Produits",
    name: "Produits & stock",
    icon: <BagIcon size={16} />,
    screen: SCREENS.produitsListe,
    region: { y: 0, h: 0.618 },
    figure: "Un stock toujours juste",
    detail: "Chaque vente décompte le produit ; les ruptures restent visibles.",
  },
  {
    id: "tops",
    tab: "Tops",
    name: "Tops & tendances",
    icon: <ChartIcon size={16} />,
    screen: SCREENS.topsClients,
    region: { y: 0.47, h: 0.47 },
    figure: "Vos meilleurs clients du mois",
    detail: "Le podium, le panier moyen, vos prestations et produits phares.",
  },
];

/**
 * The first screen: BeautIzzy as a whole. The approved headline; beside it,
 * the genuine Accueil screen and a guided tour of the five modules — a
 * close-up of the real screen and the figure it shows, one at a time, with a
 * progress line, a pause control, and the reader in charge as soon as they
 * choose a module. The entrance is CSS (it plays without JavaScript); the
 * tour pauses off screen and never advances under reduced motion.
 */
export function Hero({ availability = storeAvailability() }: { availability?: StoreAvailability }) {
  const contact = contactHref("Demande d’accès à BeautIzzy");
  const launched = availability.available.length > 0;
  const steps: TourStep[] = MODULES.map((module, index) => ({
    id: module.id,
    label: module.tab,
    icon: module.icon,
    panel: (
      <article className="overflow-hidden rounded-[1.75rem] bg-background shadow-lifted ring-1 ring-border/70">
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
          <span className="tour-part type-caption inline-flex items-center gap-2 uppercase tracking-[0.12em] text-lavender-700" style={{ "--i": 0 } as CSSProperties}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-lavender-50">
              {module.icon}
            </span>
            {module.name}
          </span>
          <span className="type-meta tabular-nums text-foreground/45">
            {index + 1}/{MODULES.length}
          </span>
        </div>
        <div className="tour-part mx-3 overflow-hidden rounded-[1.15rem] ring-1 ring-border/60" style={{ "--i": 1 } as CSSProperties}>
          <Closeup screen={module.screen} region={module.region} sizes="(min-width: 1024px) 400px, 92vw" priority={index === 0} />
        </div>
        <div className="flex flex-col gap-1 px-5 pb-5 pt-4">
          <p className="tour-part font-display text-[1.45rem] leading-tight sm:text-[1.6rem]" style={{ "--i": 2 } as CSSProperties}>
            {module.figure}
          </p>
          <p className="tour-part type-body-small text-foreground/70" style={{ "--i": 3 } as CSSProperties}>
            {module.detail}
          </p>
        </div>
      </article>
    ),
  }));

  return (
    <section aria-labelledby="hero-title" className="overflow-hidden bg-[linear-gradient(180deg,var(--bz-lavender-25)_0%,#fff_82%)]">
      <Container className="grid items-center gap-10 pb-14 pt-10 sm:pt-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10 lg:pb-20 lg:pt-12">
        <div className="hero-in hero-in-rise flex flex-col items-start gap-6" style={{ "--t": "1100ms" } as CSSProperties}>
          <Eyebrow>Pour les pros de la beauté sur rendez-vous</Eyebrow>
          <h1 id="hero-title" className="type-display">
            Votre activité beauté, <em className="text-lavender-700">simplement maîtrisée.</em>
          </h1>
          <p className="type-lead max-w-xl text-foreground/75">
            Rendez-vous, clientèle, caisse, produits et statistiques : tout ce qu’il faut pour piloter votre activité, dans
            une application mobile pour iPhone et Android, pensée pour votre métier.
          </p>
          {/* Where to get it: official badges once a listing is public, the truth before. */}
          <div className="flex w-full flex-col items-start gap-4">
            <StoreBadges stores={availability.available} height={48} />
            {!launched && contact ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <a href={contact}>Demander un accès</a>
              </Button>
            ) : null}
            {availability.pending.length > 0 ? (
              <PendingPlatforms stores={availability.pending} className="w-full" />
            ) : null}
          </div>
          <ul aria-label="Pour quels métiers" className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {PROFESSIONS.map(({ label, Icon }) => (
              <li key={label} className="type-meta inline-flex items-center gap-2 font-semibold text-foreground/70">
                <Icon size={17} className="text-lavender-700" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div>
          {/* The composition: the Nacre panel is the padded box of the tour, so the
              rail always sits inside it; the caption sits below, outside. */}
          <div className="relative isolate px-3 pb-3 pt-4 sm:px-5 sm:pb-5 sm:pt-6">
            <div
              aria-hidden="true"
              className="hero-in hero-in-fade absolute inset-0 -z-10 overflow-hidden rounded-[2rem] ring-1 ring-lavender-200/70 lg:rounded-[2.75rem]"
              style={{ "--t": "1400ms" } as CSSProperties}
            >
              <NacreCover idPrefix="hero" />
              <PauseOffscreen />
            </div>
            <div
              className="hero-in hero-in-phone absolute left-[5%] top-12 hidden w-[40%] max-w-[250px] sm:block"
              style={{ "--d": "150ms", "--t": "1200ms" } as CSSProperties}
            >
              <DeviceFrame screen={SCREENS.accueil} sizes="250px" />
            </div>
            <FeatureTour
              steps={steps}
              label="Les modules de BeautIzzy"
              mode="loop"
              className="relative gap-4 sm:gap-6"
              panelsClassName="hero-in hero-in-stage [--d:380ms] mx-auto w-full max-w-[440px] sm:ml-auto sm:mr-[2%] sm:w-[60%] sm:pt-8 lg:pt-10"
              tabsClassName="hero-in hero-in-rise [--d:650ms]"
            />
          </div>
          <DemoNote className="mt-5 text-center">Captures réelles de l’application · données de démonstration fictives</DemoNote>
        </div>
      </Container>
    </section>
  );
}
