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
  tagline: "L'agenda simple des professionnelles de la beauté",
  description:
    "BeautIzzy est l'application mobile qui aide les professionnelles de la beauté à gérer leurs rendez-vous, leurs clientes et leur caisse, sans la complexité d'un logiciel de salon.",
} as const;
