// BeautIzzy — Product Discovery content and paging rules

import { discoveryIllustrations } from '../../illustrations';
import {
  DISCOVERY_CONTINUE_TITLE,
  DISCOVERY_FINAL_TITLE,
  DISCOVERY_SIGN_IN_TITLE,
  DISCOVERY_SLIDES,
  clampDiscoveryPage,
  getDiscoveryPageLabel,
  getDiscoveryPrimaryTitle,
  isLastDiscoveryPage,
  resolveDiscoveryIllustrationSide,
  resolveDiscoveryPage,
} from '../discovery-slides';

describe('discovery slides', () => {
  it('are exactly the three approved slides, in order, with the approved copy', () => {
    expect(DISCOVERY_SLIDES.map((slide) => slide.key)).toEqual(['organisation', 'products', 'insights']);
    expect(DISCOVERY_SLIDES.map((slide) => [slide.title, slide.description])).toEqual([
      [
        'Votre activité, c’est easy.',
        'Rendez-vous, prestations et clientèle : gérez tout votre quotidien au même endroit, simplement.',
      ],
      [
        'Vos produits, votre stock, vos ventes.',
        'Gérez votre catalogue, suivez votre stock et enregistrez vos ventes de produits en quelques gestes.',
      ],
      [
        'Découvrez ce qui fait votre succès.',
        'Identifiez vos clients qui dépensent le plus, repérez vos meilleures ventes et suivez l’évolution de votre activité.',
      ],
    ]);
  });

  it('map the approved masters: starter services, products, clients — never the paywall one', () => {
    expect(DISCOVERY_SLIDES.map((slide) => slide.illustration)).toEqual([
      discoveryIllustrations.organisation,
      discoveryIllustrations.products,
      discoveryIllustrations.insights,
    ]);
    expect(discoveryIllustrations.organisation).toBe(
      require('../../../../../assets/illustrations/onboarding/starter-services.png'),
    );
    expect(discoveryIllustrations.products).toBe(require('../../../../../assets/illustrations/onboarding/products.png'));
    expect(discoveryIllustrations.insights).toBe(require('../../../../../assets/illustrations/onboarding/clients.png'));
    const growth = require('../../../../../assets/illustrations/paywall/growth.png');
    expect(DISCOVERY_SLIDES.some((slide) => slide.illustration === growth)).toBe(false);
  });

  it('never claim a payment is processed, and never use a gendered client word', () => {
    for (const slide of DISCOVERY_SLIDES) {
      const text = `${slide.title} ${slide.description}`;
      expect(text).not.toMatch(/paiement en ligne|encaissez|payez|carte bancaire/i);
      expect(text).not.toMatch(/\bclientes?\b/i);
    }
    expect(DISCOVERY_SIGN_IN_TITLE).toBe('Déjà un compte ? Se connecter');
  });

  it('clamps pages and resolves the nearest page from a scroll offset', () => {
    expect(clampDiscoveryPage(-1)).toBe(0);
    expect(clampDiscoveryPage(7)).toBe(2);
    expect(clampDiscoveryPage(1.4)).toBe(1);
    expect(resolveDiscoveryPage(0, 402)).toBe(0);
    expect(resolveDiscoveryPage(200, 402)).toBe(0);
    expect(resolveDiscoveryPage(202, 402)).toBe(1);
    expect(resolveDiscoveryPage(804, 402)).toBe(2);
    expect(resolveDiscoveryPage(900, 0)).toBe(0);
  });

  it('sizes the illustration to the height left by the brand mark and the two actions', () => {
    expect(resolveDiscoveryIllustrationSide(667)).toBe(156); // iPhone SE: the floor
    expect(resolveDiscoveryIllustrationSide(874)).toBe(250); // iPhone 17
    expect(resolveDiscoveryIllustrationSide(956)).toBe(300); // iPhone 17 Pro Max: the cap
  });

  it('labels the primary action and the pagination for the current page', () => {
    expect(isLastDiscoveryPage(0)).toBe(false);
    expect(isLastDiscoveryPage(2)).toBe(true);
    expect(getDiscoveryPrimaryTitle(0)).toBe(DISCOVERY_CONTINUE_TITLE);
    expect(getDiscoveryPrimaryTitle(1)).toBe('Continuer');
    expect(getDiscoveryPrimaryTitle(2)).toBe(DISCOVERY_FINAL_TITLE);
    expect(getDiscoveryPageLabel(1)).toBe('Écran 2 sur 3, Vos produits, votre stock, vos ventes.');
  });
});
