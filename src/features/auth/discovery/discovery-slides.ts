// BeautIzzy — Product Discovery content (pure)
//
// The three approved slides are the signed-out first-launch experience
// (docs/product/PRODUCT.md §17): marketing / product education, never a
// configuration step, and there is no separate Welcome screen before them.
// Every claim describes a capability that exists in the product today
// (Agenda, Clientèle, Prestations; Produits, stock and recorded product
// sales; « Tops & tendances »: top-spending clients, top prestations and
// products, the amount collected per period). BeautIzzy records amounts and
// payment methods — it never processes a payment, and the copy never says it
// does.

import { discoveryIllustrations } from '../illustrations';

export type DiscoverySlideKey = 'organisation' | 'products' | 'insights';

export interface DiscoverySlide {
  readonly key: DiscoverySlideKey;
  readonly title: string;
  readonly description: string;
  /** The approved master, drawn as supplied. */
  readonly illustration: number;
}

export const DISCOVERY_SLIDES: readonly DiscoverySlide[] = [
  {
    key: 'organisation',
    title: 'Votre activité, c’est easy.',
    description:
      'Rendez-vous, prestations et clientèle : gérez tout votre quotidien au même endroit, simplement.',
    illustration: discoveryIllustrations.organisation,
  },
  {
    key: 'products',
    title: 'Vos produits, votre stock, vos ventes.',
    description:
      'Gérez votre catalogue, suivez votre stock et enregistrez vos ventes de produits en quelques gestes.',
    illustration: discoveryIllustrations.products,
  },
  {
    key: 'insights',
    title: 'Découvrez ce qui fait votre succès.',
    description:
      'Identifiez vos clients qui dépensent le plus, repérez vos meilleures ventes et suivez l’évolution de votre activité.',
    illustration: discoveryIllustrations.insights,
  },
];

export const DISCOVERY_SKIP_TITLE = 'Passer';
export const DISCOVERY_SKIP_LABEL = 'Passer la présentation';
export const DISCOVERY_CONTINUE_TITLE = 'Continuer';
export const DISCOVERY_FINAL_TITLE = 'Créer mon compte';
export const DISCOVERY_SIGN_IN_TITLE = 'Déjà un compte ? Se connecter';

/**
 * Side of the (square) slide illustration for a window height. Unlike the
 * setup hero, a Discovery page also carries the brand mark above and the
 * sign-in link below, so the illustration takes what the height leaves once
 * the top bar, the mark, a two-line title, a three-line description, the
 * pills and both actions are placed (about 624 pt with the safe areas of a
 * notched phone): ≈ 250 on an iPhone 17, capped at 300 on a Pro Max, and the
 * 156 floor on an iPhone SE, where the spacing also tightens.
 */
export function resolveDiscoveryIllustrationSide(windowHeight: number): number {
  return Math.round(Math.min(300, Math.max(156, windowHeight - 624)));
}

/** Window heights at or under this are a small phone (iPhone SE: 667). */
export const DISCOVERY_SMALL_WINDOW_HEIGHT = 700;

/** Keeps a page index inside the slides. */
export function clampDiscoveryPage(index: number): number {
  return Math.min(DISCOVERY_SLIDES.length - 1, Math.max(0, Math.round(index)));
}

/** The page nearest to a horizontal scroll offset, for one page per window width. */
export function resolveDiscoveryPage(offsetX: number, pageWidth: number): number {
  if (pageWidth <= 0) return 0;
  return clampDiscoveryPage(offsetX / pageWidth);
}

export function isLastDiscoveryPage(index: number): boolean {
  return clampDiscoveryPage(index) === DISCOVERY_SLIDES.length - 1;
}

/** « Continuer » on the first pages, « Créer mon compte » on the last one. */
export function getDiscoveryPrimaryTitle(index: number): string {
  return isLastDiscoveryPage(index) ? DISCOVERY_FINAL_TITLE : DISCOVERY_CONTINUE_TITLE;
}

/** Spoken by the pagination: « Écran 2 sur 3, Vos produits, votre stock, vos ventes. » */
export function getDiscoveryPageLabel(index: number): string {
  const page = clampDiscoveryPage(index);
  return `Écran ${page + 1} sur ${DISCOVERY_SLIDES.length}, ${DISCOVERY_SLIDES[page]!.title}`;
}
