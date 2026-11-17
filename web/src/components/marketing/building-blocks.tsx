import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { AppScreen } from "./screens";

/** The small caps line above a section title. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "type-caption inline-flex items-center gap-2 uppercase tracking-[0.14em] text-lavender-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Eyebrow, Fraunces title, Manrope lead — the opening of every landing section. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "start",
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "start" | "center";
}) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className="type-headline [&_em]:italic [&_em]:text-lavender-700"
      >
        {title}
      </h2>
      {lead ? <p className="type-lead text-foreground/75">{lead}</p> : null}
    </div>
  );
}

/** A check-marked list of short, true statements. */
export function TrueList({
  items,
  className,
}: {
  items: readonly ReactNode[];
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "type-body flex flex-col gap-3 text-foreground/80",
        className,
      )}
    >
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mt-1 size-[17px] shrink-0 text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5.5 12.5 4.2 4.2 8.8-9.4" />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A real application screen in a phone frame (navy bezel, the BeautIzzy
 * foreground). `width` is the frame's rendered CSS width at the largest
 * breakpoint; `sizes` lets the browser pick the right image candidate.
 */
export function DeviceFrame({
  screen,
  sizes,
  priority = false,
  className,
}: {
  screen: AppScreen;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[2.6rem] bg-foreground p-[9px] shadow-[0_28px_60px_rgba(31,28,61,0.24),0_6px_16px_rgba(31,28,61,0.12)]",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[2.1rem] bg-surface">
        <Image
          src={screen.image}
          alt={screen.alt}
          sizes={sizes}
          priority={priority}
          placeholder="blur"
          className="block h-auto w-full"
        />
      </div>
    </div>
  );
}

/** A region of a screenshot, as fractions of its width and height. */
export interface ScreenRegion {
  readonly x?: number;
  readonly y: number;
  readonly w?: number;
  readonly h: number;
}

/**
 * A CLOSE-UP of a real screen: one region of an authentic screenshot,
 * enlarged so its detail reads at a glance. The box keeps the region's own
 * proportions (no layout shift); `sizes` is the width the WHOLE image is drawn
 * at (box width ÷ region width), so the browser picks a sharp enough file.
 */
export function Closeup({
  screen,
  region,
  sizes,
  decorative = false,
  priority = false,
  className,
}: {
  screen: AppScreen;
  region: ScreenRegion;
  sizes: string;
  decorative?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const { x = 0, y, w = 1, h } = region;
  const ratio = (w * screen.image.width) / (h * screen.image.height);
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={screen.image}
        alt={decorative ? "" : screen.alt}
        sizes={sizes}
        priority={priority}
        placeholder="blur"
        className="absolute h-auto max-w-none"
        style={{
          width: `${100 / w}%`,
          left: `${(-100 * x) / w}%`,
          top: `${(-100 * y) / h}%`,
        }}
      />
    </div>
  );
}

/**
 * The paper of the BeautIzzy receipts (src/shared/ui/ReceiptPaper.tsx): a warm
 * near-white, flat, torn top and bottom edges of 10 px teeth.
 */
export function ReceiptPaper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative drop-shadow-[0_8px_12px_rgba(31,28,61,0.12)]",
        className,
      )}
    >
      <div aria-hidden="true" className="receipt-edge receipt-edge-top" />
      <div className="bg-[var(--bz-receipt-paper)] px-5 pb-4 pt-6">
        {children}
      </div>
      <div aria-hidden="true" className="receipt-edge receipt-edge-bottom" />
    </div>
  );
}

/** The dashed tear line between the sections of a receipt. */
export function TearLine({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "my-4 border-t border-dashed border-[var(--bz-receipt-separator)]",
        className,
      )}
    />
  );
}

/**
 * The printer capsule the receipts come out of (src/shared/ui/ReceiptPrinter.tsx):
 * light glass, the groove in its lower half, a small status light at its end.
 */
export function PrinterCapsule({
  className,
  lightClassName,
}: {
  className?: string;
  lightClassName?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-8 rounded-full bg-[linear-gradient(180deg,rgb(255_255_255/0.98),rgb(246_243_252/0.96))] shadow-[0_8px_22px_rgba(31,28,61,0.16),inset_0_0_0_1px_rgba(31,28,61,0.06)]",
        className,
      )}
    >
      <span className="absolute inset-x-[7px] top-[17px] h-1.5 rounded-full bg-[var(--bz-receipt-slot)]" />
      <span
        className={cn(
          "absolute right-[15px] top-[7px] size-[5px] rounded-full bg-[#118659]",
          lightClassName,
        )}
      />
    </div>
  );
}

/** « Exemple · données fictives » — said wherever demonstration content appears. */
export function DemoNote({
  children = "Captures de l’application · données de démonstration fictives",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("type-meta text-foreground/55", className)}>{children}</p>
  );
}
