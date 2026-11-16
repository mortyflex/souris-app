import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/reveal";
import { ChevronDownIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/container";

import { pendingSentence, storeAvailability, type StoreAvailability } from "@/lib/stores";

import { SectionHeading } from "./building-blocks";

/** Only what is true today: each answer is backed by the application or its documentation. */
const QUESTIONS: readonly { question: string; answer: ReactNode }[] = [
  {
    question: "Pour quels métiers BeautIzzy est-elle pensée ?",
    answer:
      "Pour les professionnels de la beauté qui travaillent sur rendez-vous : coiffure, ongles, esthétique, bien-être. Vous choisissez votre métier en créant votre espace, et l’application s’y adapte.",
  },
  {
    question: "Faut-il un ordinateur ?",
    answer:
      "Non. BeautIzzy est une application pour iPhone et Android, conçue pour être utilisée sur votre téléphone, entre deux clients.",
  },
  {
    question: "Puis-je importer mes clients ?",
    answer:
      "Oui, depuis un fichier : nom, prénom, téléphone et e-mail. Les doublons sont repérés. L’historique d’un autre logiciel n’est pas importé : votre historique BeautIzzy commence avec vous.",
  },
  {
    question: "Mes données sont-elles sauvegardées ?",
    answer:
      "Vos rendez-vous, clients et encaissements sont enregistrés sur votre téléphone, puis synchronisés avec votre compte dès que la connexion le permet. Vous les retrouvez en vous connectant sur un autre téléphone.",
  },
  {
    question: "Mes clients reçoivent-ils un rappel ?",
    answer:
      "Si vous activez les rappels, un e-mail part 24 h avant le rendez-vous, pour chaque client dont vous avez l’adresse e-mail.",
  },
  {
    question: "Mes clients peuvent-ils réserver en ligne ?",
    answer: "Pas encore : la réservation en ligne est en préparation et n’est pas ouverte au public.",
  },
];

/** « Où télécharger BeautIzzy ? » — answered from the store configuration, never ahead of it. */
function storeAnswer(availability: StoreAvailability): string {
  const names = availability.available.map((store) => (store.id === "appStore" ? "l’App Store" : store.storeName)).join(" et ");
  if (availability.available.length === 0) {
    return "BeautIzzy sera proposée sur l’App Store et Google Play. Elle n’y est pas encore publiée : cette page affichera les liens officiels dès qu’elle le sera.";
  }
  if (availability.pending.length === 0) return `Sur ${names} : les liens officiels se trouvent en haut et en bas de cette page.`;
  return `Elle est disponible sur ${names}. ${pendingSentence(availability.pending)}`;
}

/**
 * Native disclosure (`<details>`): keyboard and screen readers for free, works
 * without JavaScript. The chevron turns; the reduced-motion rule stills it.
 */
export function FaqSection({ availability = storeAvailability() }: { availability?: StoreAvailability }) {
  const questions = [...QUESTIONS.slice(0, 2), { question: "Où télécharger BeautIzzy ?", answer: storeAnswer(availability) }, ...QUESTIONS.slice(2)];

  return (
    <section id="questions" aria-labelledby="faq-title" className="scroll-mt-24 py-16 lg:py-24">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal>
          <SectionHeading id="faq-title" eyebrow="Questions" title={<>Les réponses, <em>simplement.</em></>} />
        </Reveal>
        <Reveal className="flex flex-col divide-y divide-border border-y border-border">
          {questions.map(({ question, answer }) => (
            <details key={question} className="group">
              <summary className="type-subtitle flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
                {question}
                <ChevronDownIcon
                  size={20}
                  className="shrink-0 text-lavender-700 transition-transform duration-[var(--bz-duration-disclosure)] ease-bz-out group-open:rotate-180"
                />
              </summary>
              <p className="type-body max-w-2xl pb-6 text-foreground/75">{answer}</p>
            </details>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
