"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/** The landing's sections, and the navigation item each one belongs to (the module sections are « Fonctionnalités »). */
const SECTION_OWNER: Readonly<Record<string, string>> = {
  fonctionnalites: "/#fonctionnalites",
  agenda: "/#fonctionnalites",
  caisse: "/#fonctionnalites",
  tendances: "/#fonctionnalites",
  produits: "/#fonctionnalites",
  clientele: "/#fonctionnalites",
  "reservation-en-ligne": "/#reservation-en-ligne",
  tarif: "/#tarif",
  questions: "/#questions",
};

/**
 * The navigation item of the section crossing the reading line (40 % from
 * the top of the view), or nothing (hero, closing call). One observer, no
 * scroll listener; on other pages (no such sections) it stays empty.
 */
function useActiveSection(): string | undefined {
  const [active, setActive] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = Object.keys(SECTION_OWNER)
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0) return;
    const crossing = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) crossing.add(entry.target.id);
          else crossing.delete(entry.target.id);
        }
        const id = sections.find((section) => crossing.has(section.id))?.id;
        setActive(id === undefined ? undefined : SECTION_OWNER[id]);
      },
      { rootMargin: "-40% 0px -59% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return active;
}

/** The desktop navigation: the current section is marked (`aria-current`) and quietly underlined. */
export function DesktopNav({ items }: { items: readonly NavItem[] }) {
  const active = useActiveSection();
  return (
    <nav aria-label="Navigation principale" className="hidden lg:block">
      <ul className="flex items-center gap-1 xl:gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active === item.href ? "location" : undefined}
              className="nav-link relative inline-flex h-11 items-center whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-semibold tracking-[0.005em] text-foreground/70 transition-colors duration-[var(--bz-duration-state)] hover:bg-lavender-50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=location]:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Marks the header `data-scrolled` once the page has left its top, so the bar
 * reinforces its background (CSS only — no height change, no layout shift).
 */
export function HeaderScrollState() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const header = ref.current?.closest("header");
    if (!header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      header.dataset.scrolled = window.scrollY > 8 ? "true" : "false";
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <span ref={ref} hidden />;
}

/**
 * The mobile menu: a disclosure under the bar (not a modal). It opens on the
 * menu button, moves focus to its first link, and closes on Escape (focus back
 * on the button), on a choice, on a tap outside, or when focus leaves it.
 * Restrained motion (opacity, a few pixels); none under reduced motion.
 */
export function MobileMenu({ items, action, note }: { items: readonly NavItem[]; action?: ReactNode; note?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = useActiveSection();

  useEffect(() => {
    if (!open) return;
    const header = buttonRef.current?.closest("header");
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (header && !header.contains(event.target as Node)) setOpen(false);
    };
    // Choosing the menu's action (a store, the contact address) closes it too.
    const onPanelClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("a")) setOpen(false);
    };
    const panel = panelRef.current;
    panel?.addEventListener("click", onPanelClick);
    const onFocus = (event: FocusEvent) => {
      if (header && event.target instanceof Node && !header.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
      panel?.removeEventListener("click", onPanelClick);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="menu-button relative grid size-11 place-items-center rounded-full bg-lavender-50 text-foreground ring-1 ring-lavender-100 transition-colors duration-[var(--bz-duration-state)] hover:bg-lavender-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="sr-only">Menu</span>
        <span aria-hidden="true" className="menu-glyph relative block h-3 w-[18px]">
          <span className="absolute inset-x-0 top-0 h-[2px] rounded-full bg-current" />
          <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-current" />
        </span>
      </button>
      <div
        ref={panelRef}
        id={panelId}
        data-open={open ? "true" : "false"}
        className="mobile-menu absolute inset-x-0 top-full border-b border-border/70 bg-background shadow-[0_18px_40px_rgba(31,28,61,0.12)]"
      >
        <nav aria-label="Navigation principale" className="mx-auto w-full max-w-6xl px-5 pb-6 pt-3 sm:px-8">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href} className="border-b border-border/60 last:border-b-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active === item.href ? "location" : undefined}
                  className="flex min-h-14 items-center justify-between rounded-xl px-2 font-display text-[1.35rem] text-foreground transition-colors duration-[var(--bz-duration-state)] hover:text-lavender-700 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent aria-[current=location]:text-lavender-700"
                >
                  {item.label}
                  <span aria-hidden="true" className="text-[1rem] text-lavender-700/70">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {action || note ? (
            <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-lavender-25 p-4 ring-1 ring-lavender-100">
              {action}
              {note}
            </div>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
