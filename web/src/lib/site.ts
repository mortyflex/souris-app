import { publicEnv } from "@/lib/env/public";

/**
 * The website's contact action: an e-mail to the configured address
 * (`NEXT_PUBLIC_CONTACT_EMAIL`), or nothing — a call to action is never
 * rendered without a real destination.
 */
export function contactHref(subject?: string): string | undefined {
  const email = publicEnv.contactEmail;
  if (email === undefined) return undefined;
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
}

/** Static facts about the website. No store URL, statistic or testimonial lives here until it is real. */
export const site = {
  name: "BeautIzzy",
  tagline: "L’application des pros de la beauté sur rendez-vous",
  description:
    "BeautIzzy est l’application mobile des professionnels de la beauté : rendez-vous, clientèle, caisse, produits et statistiques, sans la complexité d’un logiciel de salon.",
} as const;
