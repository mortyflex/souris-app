import Link from "next/link";
import type { ReactNode } from "react";

import { NacreCover } from "@/components/brand/nacre-cover";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { ArrowRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

import { Closeup, DemoNote, SectionHeading } from "./building-blocks";
import { SCREENS } from "./screens";

/**
 * The application at a glance — a bento with a rhythm: one large Agenda
 * close-up, a deep-violet typographic Caisse tile, the podium on Nacre, then
 * three compact close-ups. Each tile is ONE link to its section; its images
 * are decorative here (each screen is described in its own section).
 */
export function ProductOverview() {
  return (
    <section id="fonctionnalites" aria-labelledby="overview-title" className="scroll-mt-24 pb-10 pt-16 lg:pb-14 lg:pt-24">
      <Container className="flex flex-col gap-12">
        <Reveal>
          <SectionHeading
            id="overview-title"
            eyebrow="Toute votre activité"
            title={
              <>
                Une seule application, <em>tout votre quotidien.</em>
              </>
            }
            lead="De l’agenda à la caisse, de la fiche client au stock : BeautIzzy réunit l’essentiel, sans la lourdeur d’un logiciel de salon."
            align="center"
          />
        </Reveal>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          <Reveal as="li" className="sm:col-span-2 lg:col-span-4 lg:row-span-2">
            <Tile href="#agenda" title="Agenda" body="Vos journées en prestations et en phases, en vue jour ou semaine." className="bg-background ring-border/80 lg:min-h-[32rem]">
              <div aria-hidden="true" className="relative mt-6 overflow-hidden rounded-[1.25rem] ring-1 ring-border/70 transition-transform duration-[var(--bz-duration-panel)] ease-bz-out group-hover:-translate-y-1 lg:absolute lg:bottom-0 lg:right-8 lg:mt-0 lg:w-[58%] lg:rounded-b-none">
                <Closeup screen={SCREENS.agendaDay} region={{ y: 0.255, h: 0.44 }} sizes="(min-width: 1024px) 440px, 90vw" decorative />
              </div>
              <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--bz-card-peach-bg)] px-3 py-1.5 text-[0.8125rem] font-semibold text-[var(--bz-card-peach-title)] lg:absolute lg:bottom-10 lg:left-8">
                Une coloration en trois phases
              </span>
            </Tile>
          </Reveal>

          <Reveal as="li" delay={80} className="lg:col-span-2">
            <Tile href="#caisse" title="Caisse" body="Encaissements, acomptes, remboursements." tone="dark" className="bg-foreground ring-foreground">
              <p className="mt-8 font-display text-[2.6rem] leading-none text-white lg:text-[3rem]">416,30&nbsp;€</p>
              <p className="type-body-small mt-2 text-white/70">encaissés ce mois-ci · exemple fictif</p>
            </Tile>
          </Reveal>

          <Reveal as="li" delay={160} className="lg:col-span-2">
            <Tile href="#tendances" title="Tops & tendances" body="Vos meilleurs clients, vos prestations phares." className="ring-lavender-200/70">
              <div aria-hidden="true" className="absolute inset-0 -z-10">
                <NacreCover animated={false} idPrefix="bento-tops" />
              </div>
              <MiniPodium />
            </Tile>
          </Reveal>

          <Reveal as="li" delay={80} className="lg:col-span-2">
            <Tile href="#produits" title="Produits" body="Catalogue et stock, à jour à chaque vente." className="bg-lavender-25 ring-lavender-100">
              <div aria-hidden="true" className="mt-5 overflow-hidden rounded-2xl bg-background ring-1 ring-border/70">
                <Closeup screen={SCREENS.produitsListe} region={{ y: 0.2, h: 0.5 }} sizes="(min-width: 1024px) 340px, 90vw" decorative />
              </div>
            </Tile>
          </Reveal>

          <Reveal as="li" delay={160} className="lg:col-span-2">
            <Tile href="#clientele" title="Clientèle" body="Chaque fiche client, avec toute son histoire." className="bg-background ring-border/80">
              <div aria-hidden="true" className="mt-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-border/70">
                <Closeup screen={SCREENS.clientAchats} region={{ y: 0.005, h: 0.32 }} sizes="(min-width: 1024px) 340px, 90vw" decorative />
              </div>
            </Tile>
          </Reveal>

          <Reveal as="li" delay={240} className="sm:col-span-2 lg:col-span-2">
            <Tile href="#reservation-en-ligne" title="Réservation en ligne" badge="Bientôt" body="Votre page publique, reliée à votre agenda." className="bg-[linear-gradient(160deg,var(--bz-lavender-25),#fff)] ring-lavender-100">
              <div aria-hidden="true" className="mt-5 overflow-hidden rounded-2xl ring-1 ring-lavender-200/70">
                <Closeup screen={SCREENS.webProfil} region={{ y: 0.42, h: 0.5 }} sizes="(min-width: 1024px) 340px, 90vw" decorative />
              </div>
            </Tile>
          </Reveal>
        </ul>
        <DemoNote className="text-center">Captures réelles de l’application · données de démonstration fictives</DemoNote>
      </Container>
    </section>
  );
}

function Tile({
  href,
  title,
  body,
  badge,
  tone = "light",
  className,
  children,
}: {
  href: string;
  title: string;
  body: string;
  badge?: string;
  tone?: "light" | "dark";
  className?: string;
  children?: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <Link
      href={href}
      className={cn(
        "group relative isolate flex h-full min-h-[15rem] flex-col overflow-hidden rounded-[1.75rem] p-6 ring-1 transition-[box-shadow,transform] duration-[var(--bz-duration-disclosure)] ease-bz-out hover:-translate-y-0.5 hover:shadow-lifted sm:p-7",
        className,
      )}
    >
      <div className="relative z-10 flex max-w-[17rem] flex-col gap-1.5">
        <span className={cn("type-title flex flex-wrap items-center gap-2", dark && "text-white")}>
          {title}
          {badge ? <span className="type-caption rounded-full bg-lavender-100 px-2.5 py-1 text-lavender-700">{badge}</span> : null}
        </span>
        <span className={cn("type-body-small", dark ? "text-white/70" : "text-foreground/70")}>{body}</span>
      </div>
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-5 top-5 z-10 grid size-9 place-items-center rounded-full transition-transform duration-[var(--bz-duration-disclosure)] ease-bz-out group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5",
          dark ? "bg-white/10 text-white" : "bg-background/90 text-lavender-700 shadow-card",
        )}
      >
        <ArrowRightIcon size={16} />
      </span>
    </Link>
  );
}

/** The podium of Tops & tendances, in its own colours (receiptPodium, receiptMedal). */
function MiniPodium() {
  const places = [
    { rank: 2, height: 46, medal: "silver" },
    { rank: 1, height: 70, medal: "gold" },
    { rank: 3, height: 32, medal: "bronze" },
  ] as const;
  return (
    <div aria-hidden="true" className="mx-auto mt-auto grid w-full max-w-[15rem] grid-cols-3 items-end gap-1.5 pt-6">
      {places.map((place) => (
        <div key={place.rank} className="flex flex-col items-center gap-1.5">
          <span
            className="grid size-7 place-items-center rounded-full border-2 text-[0.75rem] font-bold"
            style={{
              background: `var(--bz-medal-${place.medal}-fill)`,
              color: `var(--bz-medal-${place.medal}-text)`,
              borderColor: `var(--bz-medal-${place.medal}-rim)`,
            }}
          >
            {place.rank}
          </span>
          <span
            className="block w-full rounded-t-lg border-t-4"
            style={{
              height: place.height,
              background: place.rank === 1 ? "var(--bz-podium-first-face)" : "var(--bz-podium-place-face)",
              borderColor: place.rank === 1 ? "var(--bz-podium-first-top)" : "var(--bz-podium-place-top)",
            }}
          />
        </div>
      ))}
    </div>
  );
}
