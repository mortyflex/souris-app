import { BrandLogo } from "@/components/brand/brand-logo";
import { NacreCover } from "@/components/brand/nacre-cover";
import { PauseOffscreen } from "@/components/motion/pause-offscreen";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PLUS_TRIAL_DAYS } from "@/lib/pricing";
import { contactHref } from "@/lib/site";
import { storeAvailability, type StoreAvailability } from "@/lib/stores";

import { PendingPlatforms, StoreBadges } from "./store-links";

/**
 * The closing invitation, on the animated Nacre material — and where the
 * header's « Télécharger » leads (#telecharger). Once a store listing is
 * public: its official badge. Before: the contact action if one is configured,
 * and the honest « Bientôt sur… ». Never a dead link.
 */
export function FinalCta({ availability = storeAvailability() }: { availability?: StoreAvailability }) {
  const contact = contactHref("Demande d’accès à BeautIzzy");
  const launched = availability.available.length > 0;
  return (
    <section id="telecharger" aria-labelledby="final-cta-title" className="scroll-mt-24 pb-20 lg:pb-28">
      <Container>
        <div className="relative isolate overflow-hidden rounded-[2.25rem] px-4 py-12 text-center ring-1 ring-lavender-200/70 sm:px-12 sm:py-16 lg:rounded-[2.75rem] lg:py-24">
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <NacreCover idPrefix="final" />
          </div>
          <PauseOffscreen />
          <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-6 rounded-[1.75rem] bg-background/85 px-6 py-10 shadow-lifted backdrop-blur-sm sm:px-10">
            <BrandLogo className="h-11" sizes="160px" />
            <h2 id="final-cta-title" className="type-headline">
              Et si vos journées devenaient <em className="text-lavender-700">plus simples</em> ?
            </h2>
            <p className="type-lead text-foreground/75">
              {launched
                ? `Téléchargez BeautIzzy et commencez par ${PLUS_TRIAL_DAYS}\u00a0jours d’essai gratuit.`
                : "BeautIzzy ouvre ses portes progressivement, aux côtés de premiers professionnels de la beauté."}
            </p>
            <StoreBadges stores={availability.available} height={48} className="justify-center" />
            {!launched && contact ? (
              <Button asChild size="lg">
                <a href={contact}>Demander un accès</a>
              </Button>
            ) : null}
            <PendingPlatforms stores={availability.pending} className="w-full max-w-[25rem] items-center text-center [&_li]:items-center [&_ul]:w-full" />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
