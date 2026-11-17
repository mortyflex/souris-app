"use client";

import { useState, type CSSProperties } from "react";

import { DemoNumber } from "@/components/motion/demo-number";
import { ChartIcon, EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

import { ReceiptPaper, TearLine } from "./building-blocks";

/** The podium starts once the paper has fed out of its capsule (≈ 1.4 s). */
const OFFSET = 1250;
const delay = (ms: number, length?: number) => ({ "--d": `${ms + OFFSET}ms`, ...(length ? { "--t": `${length}ms` } : {}) }) as CSSProperties;

type Medal = "gold" | "silver" | "bronze";

/**
 * « Clients qui dépensent le plus », the page of the Tops & tendances ticket
 * (src/features/insights), reproduced with the demo's figures. Placed 2 · 1 · 3
 * as in the app; they rise 3, 2, 1 — the winner last, with a sheen.
 */
const PLACES: readonly { rank: 1 | 2 | 3; name: string; cents: number; medal: Medal; height: number; at: number }[] = [
  { rank: 2, name: "Inès P.", cents: 10700, medal: "silver", height: 62, at: 1000 },
  { rank: 1, name: "Sofia J.", cents: 15900, medal: "gold", height: 92, at: 1350 },
  { rank: 3, name: "Julie M.", cents: 7630, medal: "bronze", height: 40, at: 700 },
];

/**
 * The eye works as in the application: it masks the CLIENTS' amounts — every
 * one of them — with the same « ••• € » pill on the same line, so nothing
 * moves; the business figures above stay written. The masked values are
 * neither shown nor spoken (`aria-hidden`, `visibility: hidden`).
 *
 * Unlike the application — where client amounts start masked at every opening
 * (src/features/insights) — this demonstration of FICTIONAL figures starts
 * with them written, so they count up with the podium; the eye masks them.
 * « Revoir » replays the scene without re-rendering it (DemoScene), so the
 * visitor's choice stays.
 */
export function PodiumDemo() {
  const [masked, setMasked] = useState(false);
  return (
    <ReceiptPaper className="w-full">
      <div className="flex flex-col items-center gap-1 text-center">
        <span aria-hidden="true" className="mb-1 grid size-10 place-items-center rounded-full bg-lavender-50 text-accent">
          <ChartIcon size={20} />
        </span>
        <p className="text-[1.1rem] font-bold">Tops &amp; tendances</p>
        <p className="type-label text-foreground/70">Novembre 2026</p>
      </div>

      <div className="da da-rise mt-4 rounded-xl bg-lavender-50 px-3 py-3 text-center" style={delay(0)}>
        <p className="type-caption uppercase tracking-[0.12em] text-accent">Encaissé</p>
        <DemoNumber value={416.3} format="euros-cents" delay={OFFSET} duration={1100} className="block text-[2rem] font-bold leading-tight text-[var(--bz-lavender-700)]" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 text-[0.88rem]">
        <span className="da da-fade text-foreground/70" style={delay(250)}>
          5 rendez-vous réalisés
        </span>
        <span className="da da-fade text-right" style={delay(380)}>
          <span className="block text-foreground/70">Panier moyen</span>
          <span className="font-bold tabular-nums">70,26 €</span>
        </span>
      </div>
      <TearLine />

      <div className="flex items-center justify-center gap-1">
        <p className="type-caption uppercase tracking-[0.12em] text-accent">Clients qui dépensent le plus</p>
        <AmountsEye masked={masked} onToggle={() => setMasked((value) => !value)} />
      </div>

      <div className="relative mt-4">
        <div className="grid grid-cols-3 items-end gap-2">
          {PLACES.map((place) => (
            <div key={place.rank} className="flex flex-col items-center">
              <span className={cn("da da-pop relative mb-2 grid size-10 place-items-center", place.rank === 1 && "da-halo")} style={{ color: `var(--bz-medal-${place.medal}-rim)`, ...delay(place.at + 400, 620) }}>
                <MedalDisc medal={place.medal} rank={place.rank} />
              </span>
              <span className="da da-fade text-center text-[0.95rem] font-bold leading-tight" style={delay(place.at + 550, 500)}>
                {place.name}
              </span>
              <ClientAmount cents={place.cents} first={place.rank === 1} masked={masked} className="da da-fade mb-2 mt-0.5" style={delay(place.at + 620, 500)} countDelay={OFFSET + place.at + 620} />
              <span
                aria-hidden="true"
                className="da da-grow relative w-full overflow-hidden rounded-t-lg border-t-[5px] pt-1.5 text-center text-[1.05rem] font-bold"
                style={{
                  height: place.height,
                  background: place.rank === 1 ? "var(--bz-podium-first-face)" : "var(--bz-podium-place-face)",
                  borderColor: place.rank === 1 ? "var(--bz-podium-first-top)" : "var(--bz-podium-place-top)",
                  color: place.rank === 1 ? "var(--bz-podium-first-number)" : "var(--bz-podium-place-number)",
                  ...delay(place.at, place.rank === 1 ? 900 : 700),
                }}
              >
                {place.rank}
                {place.rank === 1 ? <span className="da-sheen absolute inset-0" style={delay(place.at + 900, 1000)} /> : null}
              </span>
            </div>
          ))}
        </div>
        <span aria-hidden="true" className="da da-grow-x block h-[2px] w-full rounded-full bg-[var(--bz-podium-place-top)]" style={delay(450, 600)} />
      </div>
      <div aria-hidden="true" className="da da-fade mt-4 flex justify-center gap-1.5" style={delay(2300)}>
        {[0, 1, 2, 3].map((dot) => (
          <span key={dot} className={cn("h-1.5 rounded-full", dot === 2 ? "w-4 bg-accent" : "w-1.5 bg-lavender-200")} />
        ))}
      </div>
      <p className="sr-only">{masked ? "Les montants des clients sont masqués." : "Les montants des clients sont affichés."}</p>
    </ReceiptPaper>
  );
}

/**
 * The eye: a toggle button, pressed while the amounts are masked. It draws the
 * current state — an open eye while they are written, a crossed one while
 * they are masked.
 */
export function AmountsEye({ masked, onToggle }: { masked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={masked}
      aria-label="Masquer les montants des clients"
      onClick={onToggle}
      className="relative grid size-11 shrink-0 place-items-center rounded-full text-accent transition-[background-color,transform] duration-[var(--bz-duration-state)] ease-bz-out hover:bg-lavender-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-90"
    >
      <EyeIcon size={19} className={cn("absolute transition-[opacity,transform] duration-[var(--bz-duration-disclosure)] ease-bz-out", masked ? "scale-75 opacity-0" : "opacity-100")} />
      <EyeOffIcon size={19} className={cn("absolute transition-[opacity,transform] duration-[var(--bz-duration-disclosure)] ease-bz-out", masked ? "opacity-100" : "scale-75 opacity-0")} />
    </button>
  );
}

/** A muted metal disc: darker rim, lighter inset ring, the rank written (receiptMedal). */
function MedalDisc({ medal, rank }: { medal: Medal; rank: number }) {
  return (
    <span
      className="grid size-10 place-items-center rounded-full border-2 text-[1rem] font-bold shadow-[0_3px_8px_rgba(31,28,61,0.16)]"
      style={{ background: `var(--bz-medal-${medal}-fill)`, borderColor: `var(--bz-medal-${medal}-rim)`, color: `var(--bz-medal-${medal}-text)` }}
    >
      <span className="grid size-[30px] place-items-center rounded-full border" style={{ borderColor: `var(--bz-medal-${medal}-inset)` }}>
        <span className="sr-only">Rang </span>
        {rank}
      </span>
    </span>
  );
}

/**
 * One client's amount, or the app's mask (« ••• € », the same line): the hidden
 * one is neither shown nor spoken, so a masked amount never leaks to assistive
 * technologies, and the place keeps its size — nothing jumps.
 */
export function ClientAmount({
  cents,
  first,
  masked,
  countDelay,
  className,
  style,
}: {
  cents: number;
  first: boolean;
  masked: boolean;
  countDelay: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={cn("grid place-items-center", className)} style={style}>
      <span
        aria-hidden={masked || undefined}
        className={cn(
          "col-start-1 row-start-1 text-[0.85rem] font-semibold transition-opacity duration-[var(--bz-duration-state)]",
          first ? "text-[var(--bz-lavender-700)]" : "text-foreground/65",
          masked && "invisible opacity-0",
        )}
      >
        <DemoNumber value={cents / 100} format="euros-cents" delay={countDelay} duration={700} />
      </span>
      <span
        aria-hidden={!masked || undefined}
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center gap-[3px] rounded-full bg-lavender-100 px-2 py-0.5 text-[0.72rem] font-semibold text-accent transition-[opacity,transform] duration-[var(--bz-duration-state)] ease-bz-out",
          masked ? "opacity-100" : "invisible scale-90 opacity-0",
        )}
      >
        <span className="sr-only">Montant masqué</span>
        <span aria-hidden="true" className="size-[5px] rounded-full bg-current opacity-50" />
        <span aria-hidden="true" className="size-[5px] rounded-full bg-current opacity-50" />
        <span aria-hidden="true" className="size-[5px] rounded-full bg-current opacity-50" />
        <span aria-hidden="true">€</span>
      </span>
    </span>
  );
}
