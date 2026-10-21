// BeautIzzy — the approved BeautIzzy Plus paywall copy (pure)
//
// Inclusive, gender-neutral French. Every claim describes a capability that
// exists in the product today. Nothing here names a price, a currency, a
// billing period or a trial length: those come from the store offering
// (`paywall-offering.ts`) and are formatted by `paywall-presentation.ts`.

export const PLUS_BRAND_NAME = 'BeautIzzy Plus';

export const PAYWALL_HEADLINE = 'Faites grandir votre activité, simplement.';

export const PAYWALL_BENEFITS = [
  'Tout votre quotidien au même endroit.',
  'Gardez le contrôle sur vos chiffres.',
  'Gagnez du temps chaque jour.',
] as const;

export const PAYWALL_PLAN_TITLES = { monthly: 'Mensuel', annual: 'Annuel' } as const;
export const PAYWALL_PLAN_PERIODS = { monthly: 'par mois', annual: 'par an' } as const;
export const PAYWALL_PLAN_SPOKEN = { monthly: 'Formule mensuelle', annual: 'Formule annuelle' } as const;

export const PAYWALL_RECOMMENDED_LABEL = 'Recommandé';
export const PAYWALL_RECOMMENDED_SPOKEN = 'recommandée';

export const PAYWALL_EXPLORE_TITLE = 'Explorer sans abonnement';
export const PAYWALL_EXPLORE_LABEL = 'Explorer sans abonnement, en lecture seule';
export const PAYWALL_RETURN_TITLE = 'Revenir à mes données';
export const PAYWALL_CONTINUE_TITLE = 'Continuer';
export const PAYWALL_CLOSE_LABEL = 'Fermer';
export const PAYWALL_BACK_LABEL = 'Retour';

export const PAYWALL_SUBSCRIBE_TITLE = 'S’abonner à BeautIzzy Plus';
export const PAYWALL_LOADING_TITLE = 'Chargement des offres…';
export const PAYWALL_NOT_CONFIGURED_FOOTNOTE = 'Achat non disponible dans cette version.';

export const PAYWALL_RESTORE_TITLE = 'Restaurer mes achats';
export const PAYWALL_TERMS_TITLE = 'Conditions d’abonnement';
export const PAYWALL_PRIVACY_TITLE = 'Confidentialité';

/** The lead of the first offer, once business setup is complete: short, so the plans come into view. */
export const PAYWALL_INITIAL_LEAD = 'Votre espace est prêt. Profitez pleinement de BeautIzzy Plus.';
/** Under « Explorer sans abonnement »: the read-only limit, said once, quietly, next to the action. */
export const PAYWALL_EXPLORE_CAPTION = 'Sans abonnement, vous pouvez consulter votre activité, sans la modifier.';

/** The reassurance of an existing account without an active subscription. */
export const PAYWALL_READ_ONLY_NOTICE_TITLE = 'Vos données sont conservées.';
export const PAYWALL_READ_ONLY_NOTICE_DETAIL =
  'Vous pouvez toujours consulter vos rendez-vous, votre clientèle et vos chiffres. Les modifications nécessitent BeautIzzy Plus.';

/** A returning subscriber: no upsell, a calm confirmation. */
export const PAYWALL_ENTITLED_TITLE = 'Votre abonnement BeautIzzy Plus est actif.';
export const PAYWALL_ENTITLED_LEAD = 'Merci de faire grandir votre activité avec BeautIzzy.';

/** The initial verification is pending: no claim either way. */
export const PAYWALL_VERIFYING_NOTICE_TITLE = 'Vérification de votre abonnement…';
export const PAYWALL_VERIFYING_NOTICE_DETAIL =
  'Un instant, nous vérifions votre abonnement BeautIzzy Plus.';

export const PAYWALL_OFFERS_UNAVAILABLE = {
  'not-configured': {
    title: 'Offres bientôt disponibles',
    detail:
      'Les formules BeautIzzy Plus ne sont pas encore proposées dans cette version. Vos données restent consultables.',
  },
  'store-unavailable': {
    title: 'Offres indisponibles pour le moment',
    detail: 'Les formules n’ont pas pu être chargées. Vérifiez votre connexion, puis réessayez plus tard.',
  },
  'no-valid-plan': {
    title: 'Offres indisponibles pour le moment',
    detail: 'Aucune formule valide n’a été trouvée. Réessayez plus tard.',
  },
  'no-account': {
    title: 'Offres indisponibles pour le moment',
    detail: 'Connectez-vous pour consulter les formules BeautIzzy Plus.',
  },
} as const;

export const PAYWALL_RETRY_OFFERS_TITLE = 'Réessayer';
