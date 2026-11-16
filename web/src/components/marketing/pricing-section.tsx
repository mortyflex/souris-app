import { NacreCover } from "@/components/brand/nacre-cover";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { CalendarIcon, ChartIcon, CheckIcon, ReceiptIcon } from "@/components/ui/icons";
import { annualMonthlyEquivalentCents, annualSavingCents, annualSavingPercent, formatPrice, PLUS_PLANS, PLUS_TRIAL_DAYS } from "@/lib/pricing";
import { contactHref } from "@/lib/site";

import { SectionHeading } from "./building-blocks";

const GROUPS = [
  { title: "Organiser", Icon: CalendarIcon, items: ["Agenda, prestations et temps de pose", "Indisponibilités protégées", "Rappels de rendez-vous par e-mail"] },
  { title: "Encaisser & vendre", Icon: ReceiptIcon, items: ["Caisse, acomptes et remises", "Remboursements et corrections", "Produits, stock et ventes"] },
  { title: "Fidéliser & piloter", Icon: ChartIcon, items: ["Fiches clients et historique", "Rappels d’anniversaire", "Tops & tendances"] },
] as const;

/**
 * BeautIzzy Plus — ONE plan, featured. The billing switch is two native
 * radios (keyboard, screen readers, and no JavaScript needed: CSS `:has`
 * shows the chosen price, src/styles/marketing.css « Pricing »). The prices
 * are the planned ones (src/lib/pricing.ts); the conditions say the store's
 * price at purchase prevails. No checkout, no countdown, no store link.
 */
export function PricingSection() {
  const contact = contactHref("Demande d’accès à BeautIzzy");
  const equivalent = annualMonthlyEquivalentCents();
  const monthlyYear = PLUS_PLANS.monthly.amountCents * 12;
  return (
    <section id="tarif" aria-labelledby="pricing-title" className="scroll-mt-24 bg-[linear-gradient(180deg,#fff,var(--bz-lavender-25)_40%,#fff)] py-16 lg:py-24">
      <Container className="flex flex-col gap-12">
        <Reveal>
          <SectionHeading
            id="pricing-title"
            eyebrow="Tarif"
            title={
              <>
                Un abonnement, <em>tout BeautIzzy.</em>
              </>
            }
            lead={`BeautIzzy Plus réunit toute l’application, sans option à ajouter. Commencez par ${PLUS_TRIAL_DAYS} jours d’essai gratuit.`}
            align="center"
          />
        </Reveal>

        <Reveal className="pricing mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2.25rem] bg-background shadow-lifted ring-1 ring-border/70 lg:grid-cols-[0.78fr_1.22fr] lg:rounded-[2.75rem]">
          {/* The trial, on Nacre. */}
          <div className="relative isolate flex flex-col justify-between gap-8 overflow-hidden p-7 sm:p-10">
            <div aria-hidden="true" className="absolute inset-0 -z-10">
              <NacreCover animated={false} idPrefix="pricing" />
            </div>
            <span className="type-caption w-fit rounded-full bg-background/85 px-3 py-1.5 uppercase tracking-[0.12em] text-lavender-700 ring-1 ring-lavender-200">Essai gratuit</span>
            <p className="flex flex-col">
              <span className="font-display text-[5.5rem] leading-[0.9] text-foreground sm:text-[6.5rem]">{PLUS_TRIAL_DAYS}</span>
              <span className="font-display text-[1.9rem] italic leading-tight text-lavender-700">jours pour tout essayer</span>
            </p>
            <p className="type-body-small max-w-[16rem] rounded-2xl bg-background/80 px-4 py-3 text-foreground/75">
              Toute l’application dès le premier jour : agenda, caisse, clients, produits, statistiques.
            </p>
          </div>

          {/* The plan. */}
          <div className="flex flex-col gap-7 p-7 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-[1.9rem] leading-tight">BeautIzzy Plus</h3>
              <span className="type-caption rounded-full bg-lavender-50 px-3 py-1.5 uppercase tracking-[0.12em] text-lavender-700">Tout inclus</span>
            </div>

            <fieldset className="plan-switch relative grid grid-cols-2 rounded-full bg-lavender-50 p-1 ring-1 ring-lavender-100">
              <legend className="sr-only">Facturation</legend>
              <span aria-hidden="true" className="plan-thumb absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-background shadow-card" />
              <label className="plan-option relative z-10 flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full px-3 text-[0.95rem] font-semibold leading-5">
                <input type="radio" name="billing" value="monthly" className="sr-only" />
                <span>Mensuel</span>
                <span className="text-[0.78rem] font-medium leading-4 opacity-80">{formatPrice(PLUS_PLANS.monthly.amountCents)} / mois</span>
              </label>
              <label className="plan-option relative z-10 flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full px-3 text-[0.95rem] font-semibold leading-5">
                <input type="radio" name="billing" value="annual" defaultChecked className="sr-only" />
                <span className="flex items-center gap-1.5">
                  Annuel
                  <span className="rounded-full bg-accent px-1.5 py-px text-[0.7rem] font-bold leading-4 text-white">−{annualSavingPercent()}&nbsp;%</span>
                </span>
                <span className="text-[0.78rem] font-medium leading-4 opacity-80">{formatPrice(PLUS_PLANS.annual.amountCents)} / an</span>
              </label>
            </fieldset>

            <div className="grid min-h-[8.5rem] overflow-hidden">
              <div data-plan="annual" className="col-start-1 row-start-1 flex flex-col gap-1.5">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[3.6rem] leading-none tracking-tight sm:text-[4.2rem]">{formatPrice(PLUS_PLANS.annual.amountCents)}</span>
                  <span className="type-body text-foreground/60">par an</span>
                </p>
                {equivalent !== undefined ? <p className="type-body font-semibold text-lavender-700">soit {formatPrice(equivalent)} par mois</p> : null}
                <p className="type-body-small text-foreground/65">
                  {formatPrice(annualSavingCents())} d’économie par rapport à 12 mois au tarif mensuel ({formatPrice(monthlyYear)}).
                </p>
              </div>
              <div data-plan="monthly" className="col-start-1 row-start-1 flex flex-col gap-1.5">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[3.6rem] leading-none tracking-tight sm:text-[4.2rem]">{formatPrice(PLUS_PLANS.monthly.amountCents)}</span>
                  <span className="type-body text-foreground/60">par mois</span>
                </p>
                <p className="type-body font-semibold text-lavender-700">Facturé chaque mois</p>
                <p className="type-body-small text-foreground/65">Soit {formatPrice(monthlyYear)} sur douze mois.</p>
              </div>
            </div>

            {contact ? (
              <Button asChild size="lg" className="w-full sm:w-fit">
                <a href={contact}>Demander un accès</a>
              </Button>
            ) : (
              <p className="type-body-small text-foreground/65">L’abonnement se souscrira dans l’application, à son ouverture au public.</p>
            )}

            <div className="grid gap-6 border-t border-border/80 pt-7 sm:grid-cols-3">
              {GROUPS.map(({ title, Icon, items }) => (
                <div key={title} className="flex flex-col gap-3">
                  <p className="type-label flex items-center gap-2">
                    <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-lavender-50 text-accent">
                      <Icon size={15} />
                    </span>
                    {title}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {items.map((item) => (
                      <li key={item} className="type-body-small flex gap-2 text-foreground/75">
                        <CheckIcon size={15} className="mt-[3px] shrink-0 text-accent" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="type-meta mx-auto flex max-w-3xl flex-col gap-1.5 text-center text-foreground/60">
          <p>
            Tarifs prévus à l’ouverture, toutes taxes comprises, sous réserve de la configuration finale des magasins d’applications ;
            le prix affiché au moment de l’achat fait foi.
          </p>
          <p>
            L’abonnement se souscrit dans l’application et se gère depuis les réglages d’abonnement de votre téléphone. Essai
            gratuit de {PLUS_TRIAL_DAYS}&nbsp;jours pour un premier abonnement.
          </p>
        </div>
      </Container>
    </section>
  );
}
