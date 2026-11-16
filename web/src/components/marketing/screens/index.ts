/**
 * Screens of the BeautIzzy mobile application, for the marketing pages.
 *
 * PROVENANCE — every image is an authentic screenshot of the real application,
 * captured on an iPhone 16 Pro simulator (November 2026) inside the developer
 * Playground's demo runtime (docs/product/PLAYGROUND.md): the real screens on a
 * FICTIONAL dataset kept in memory — no account, no network, no real client.
 * The only retouches are the removal of the Playground’s « Démonstration » badge
 * (a development-only label) and cropping — the Accueil and Agenda screens stop
 * above the tab bar, whose last tab is the Playground’s own « Démo » (the
 * application’s is « Plus »). Names, prices and volumes are
 * fictional; the pages that show them say so.
 *
 * `share-tops-prestations` is NOT a screenshot: it is the image the app itself
 * exported with « Enregistrer » (Tops & tendances, « Top prestations »), copied
 * byte for byte from the simulator's Photos library, then converted to WebP.
 *
 * The `web-*` images are the BeautIzzy website itself (the public page and
 * the steps of the booking flow), captured from a local build on
 * a fictional mock profile — no hosted service, no real Business.
 *
 * Static imports: Next.js knows each size (no layout shift) and serves
 * responsive WebP candidates with a blur placeholder.
 */
import type { StaticImageData } from "next/image";

import accueil from "./accueil.webp";
import agendaDay from "./agenda-day.webp";
import caisseMois from "./caisse-mois.webp";
import clientAchats from "./client-achats.webp";
import clientFiche from "./client-fiche.webp";
import clientHistorique from "./client-historique.webp";
import produitsListe from "./produits-liste.webp";
import rendezVousPhases from "./rendez-vous-phases.webp";
import shareTopsPrestations from "./share-tops-prestations.webp";
import topsClients from "./tops-clients.webp";
import webCreneaux from "./web-creneaux.webp";
import webPrestation from "./web-prestation.webp";
import webProfil from "./web-profil.webp";
import webRecap from "./web-recap.webp";

export interface AppScreen {
  readonly image: StaticImageData;
  /** What the screen shows, for assistive technologies. */
  readonly alt: string;
}

export const SCREENS = {
  accueil: {
    image: accueil,
    alt: "Écran Accueil de BeautIzzy : prochain rendez-vous, rendez-vous et chiffre d’affaires potentiel du jour, encaissements du jour et actions rapides.",
  },
  agendaDay: {
    image: agendaDay,
    alt: "Agenda du jour : une coloration en deux temps, avec une coupe placée pendant son temps de pose, puis d’autres rendez-vous.",
  },
  caisseMois: {
    image: caisseMois,
    alt: "Caisse, vue du mois : total encaissé, évolution par rapport à la période précédente, répartition carte et espèces, produits vendus.",
  },
  clientAchats: {
    image: clientAchats,
    alt: "Fiche client, onglet Achats : rendez-vous réalisés, total dépensé, achats de produits, anniversaire et notes.",
  },
  clientFiche: {
    image: clientFiche,
    alt: "Fiche client : coordonnées, rappel d’anniversaire, prochain rendez-vous et activité.",
  },
  clientHistorique: {
    image: clientHistorique,
    alt: "Fiche client, onglet Rendez-vous : les trois derniers rendez-vous, avec la date, la prestation et le montant.",
  },
  produitsListe: {
    image: produitsListe,
    alt: "Catalogue de produits : nom, marque, catégorie, prix et stock de chaque produit, dont un produit en rupture.",
  },
  rendezVousPhases: {
    image: rendezVousPhases,
    alt: "Détail d’un rendez-vous de coloration en trois phases : application, temps de pose, finition.",
  },
  topsClients: {
    image: topsClients,
    alt: "Tops et tendances : montant encaissé du mois et podium des clients qui dépensent le plus.",
  },
  shareTopsPrestations: {
    image: shareTopsPrestations,
    alt: "Image exportée de Tops & tendances, au format story : le top des prestations de novembre 2026 — Balayage, Brushing, Coupe + brushing —, le chiffre d’affaires flouté, et « Créé avec BeautIzzy ».",
  },
  webProfil: {
    image: webProfil,
    alt: "Page publique d’un établissement fictif sur le site BeautIzzy : couverture, nom, boutons Appeler et Écrire.",
  },
  webPrestation: {
    image: webPrestation,
    alt: "Réservation en ligne, étape 1 : le choix de la prestation, avec sa durée.",
  },
  webCreneaux: {
    image: webCreneaux,
    alt: "Réservation en ligne, étape date et horaire : une bande de dates, les horaires du matin, et le créneau choisi en bas de l’écran.",
  },
  webRecap: {
    image: webRecap,
    alt: "Réservation en ligne, dernière étape : le récapitulatif de la prestation, de la date et de l’horaire.",
  },
} as const satisfies Record<string, AppScreen>;
