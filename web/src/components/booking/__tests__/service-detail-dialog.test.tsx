import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BookableService } from "@/features/availability/availability";

import { ServiceDetailDialog, ServiceDetailDialogView } from "../service-detail-dialog";

/** The no-break spaces Intl writes in prices, built from code points (no invisible character in the source). */
const SPACES = new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', "g");
const noop = () => undefined;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(SPACES, " ");

const LONG =
  "Un soin complet en trois temps pour retrouver un teint lumineux.\n\nNettoyage en profondeur, exfoliation douce, puis masque adapté à votre peau.\nPendant la pose, massage du cou et du décolleté.\n\nÀ éviter dans les 48 h qui suivent une exposition prolongée au soleil";
const soin: BookableService = {
  id: "svc-soin",
  name: "Soin du visage avec masque",
  durationMinutes: 75,
  description: LONG,
  priceCents: 8900,
  category: { id: "cat-visage", name: "Soins du visage", position: 0 },
};
const dialog = (service: BookableService = soin) => renderToStaticMarkup(<ServiceDetailDialogView service={service} onClose={noop} />);
const attribute = (markup: string, element: string, name: string) => new RegExp(`<${element}[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1];

describe("ServiceDetailDialog — a real dialog", () => {
  it("is a native <dialog>, titled by the service name and described by its whole description", () => {
    const markup = dialog();
    expect(markup).toMatch(/^<dialog /);
    const titleId = attribute(markup, "dialog", "aria-labelledby");
    const descriptionId = attribute(markup, "dialog", "aria-describedby");
    expect(markup).toContain(`<h2 id="${titleId}" class="type-title`);
    expect(markup).toMatch(new RegExp(`<h2 id="${titleId}"[^>]*>Soin du visage avec masque</h2>`));
    // The description element holds every paragraph.
    const described = markup.slice(markup.indexOf(`id="${descriptionId}"`));
    expect(text(described)).toContain("Un soin complet en trois temps");
    expect(text(described)).toContain("exposition prolongée au soleil");
  });

  it("is hidden until the browser shows it as a modal (`showModal`): never in the page's flow", () => {
    const classes = attribute(dialog(), "dialog", "class") ?? "";
    expect(classes.split(" ")).toEqual(expect.arrayContaining(["hidden", "open:flex", "fixed", "inset-0", "border-0", "bg-transparent"]));
    expect(dialog()).not.toMatch(/<dialog[^>]*\sopen(=|\s|>)/);
  });

  it("has ONE control: « Fermer le détail », a real button — nothing nested", () => {
    const markup = dialog();
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toMatch(/<button type="button" aria-label="Fermer le détail"[^>]*>/);
    // The close control comes before the text: it gets the first focus, the region the second.
    expect(markup.indexOf("Fermer le détail")).toBeLessThan(markup.indexOf('role="region"'));
  });

  it("keeps the page still while it is open, and scrolls its own description", () => {
    const markup = dialog();
    expect(markup).toMatch(/<dialog[^>]*data-scroll-lock=""/);
    expect(markup).toMatch(/<div role="region" aria-label="Description de la prestation" tabindex="0" class="[^"]*overflow-y-auto overscroll-contain/);
    // The end of a long text fades out over the bottom padding (at least 1.5rem), never over a last line.
    expect(markup).toMatch(/role="region"[^>]*class="[^"]*pb-7 \[mask-image:linear-gradient\(to_bottom,#000_calc\(100%-1\.5rem\),transparent\)\][^"]*sm:pb-8/);
  });

  it("globals.css: never a smooth scroll behind it; the root's scrolling switched off ONLY with a mouse or a trackpad", () => {
    const globals = readFileSync(path.join(__dirname, "../../../app/globals.css"), "utf8");
    expect(globals).toMatch(/html:has\(dialog\[data-scroll-lock\]\[open\]\) \{\s*scroll-behavior: auto;\s*\}/);
    // The root's overflow changes only inside the fine-pointer query: on a touch screen (iOS Safari) the page's own
    // scrolling — and with it the browser's toolbars and every fixed element — is left alone.
    const media = /@media \(hover: hover\) and \(pointer: fine\) \{\s*html:has\(dialog\[data-scroll-lock\]\[open\]\) \{\s*overflow: hidden;\s*scrollbar-gutter: stable;\s*\}\s*\}/;
    expect(globals).toMatch(media);
    expect(globals.replace(media, "").match(/overflow: hidden/g)).toBeNull();
  });
});

describe("ServiceDetailDialog — what it shows", () => {
  it("shows the whole description, paragraph by paragraph, its line breaks kept — nothing cut or added", () => {
    const markup = dialog();
    const paragraphs = [...markup.matchAll(/<p class="type-body whitespace-pre-line[^"]*">([^<]*)<\/p>/g)].map((match) => match[1]);
    expect(paragraphs).toEqual([
      "Un soin complet en trois temps pour retrouver un teint lumineux.",
      "Nettoyage en profondeur, exfoliation douce, puis masque adapté à votre peau.\nPendant la pose, massage du cou et du décolleté.",
      "À éviter dans les 48 h qui suivent une exposition prolongée au soleil",
    ]);
    expect(markup).not.toMatch(/max-h-\[2lh\]|line-clamp|text-ellipsis|…/);
  });

  it("never renders a description as markup", () => {
    const markup = dialog({ ...soin, description: '<img src=x onerror="alert(1)"><b>gras</b>\n\n<script>x()</script>' });
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<b>");
    expect(markup).not.toContain("<script");
    expect(markup).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;b&gt;gras&lt;/b&gt;");
  });

  it("shows the category, the duration and the indicative price", () => {
    const html = text(dialog());
    expect(html).toContain("Soins du visage");
    expect(html).toContain("1 h 15");
    expect(html).toContain("89 € Tarif indicatif");
  });

  it("reads a price of 0 as « Tarif à confirmer », never free — and no price when the server sent none", () => {
    const zero = text(dialog({ ...soin, priceCents: 0 }));
    expect(zero).toContain("Tarif à confirmer");
    expect(zero).not.toMatch(/gratuit|0 €|Tarif indicatif/i);
    const none = dialog({ ...soin, priceCents: undefined, category: undefined });
    expect(none).not.toContain("data-price");
    expect(text(none)).not.toMatch(/€|Tarif/);
    expect(text(none)).not.toContain("Soins du visage");
  });

  it("without a description: no region and no aria-describedby", () => {
    const markup = dialog({ ...soin, description: undefined });
    expect(markup).not.toContain("aria-describedby");
    expect(markup).not.toContain('role="region"');
  });

  it("never suggests a payment", () => {
    expect(text(dialog())).not.toMatch(/payer|paiement|régler|carte bancaire/i);
  });
});

describe("ServiceDetailDialog — a bottom sheet on a phone, a modal from the sm breakpoint", () => {
  const panel = (markup: string) => /<div data-dialog-panel="" class="([^"]+)"/.exec(markup)?.[1].split(" ") ?? [];

  it("phone: anchored to the bottom, as tall as its content up to 85 % of the viewport, above the safe area", () => {
    const markup = dialog();
    expect(attribute(markup, "dialog", "class")?.split(" ")).toEqual(expect.arrayContaining(["items-end", "justify-center"]));
    expect(panel(markup)).toEqual(
      expect.arrayContaining(["w-full", "max-h-[85vh]", "supports-[height:100svh]:max-h-[85svh]", "rounded-t-[1.75rem]", "pb-[max(0.5rem,env(safe-area-inset-bottom))]"]),
    );
    // A discreet handle, decorative only, never on a larger screen.
    expect(markup).toMatch(/<div aria-hidden="true" class="[^"]*h-1\.5 w-10[^"]*sm:hidden"><\/div>/);
  });

  it("tablet and desktop: centered, about 600 px wide, rounded all around", () => {
    const markup = dialog();
    expect(attribute(markup, "dialog", "class")?.split(" ")).toEqual(expect.arrayContaining(["sm:items-center", "sm:p-6"]));
    expect(panel(markup)).toEqual(
      expect.arrayContaining(["sm:max-w-[38rem]", "sm:rounded-[1.75rem]", "sm:max-h-[min(85vh,46rem)]", "sm:supports-[height:100svh]:max-h-[min(85svh,46rem)]", "sm:pb-0"]),
    );
  });

  it("its height never follows Safari's toolbars: the SMALL viewport (svh), never the dynamic one (dvh)", () => {
    expect(panel(dialog()).filter((name) => name.includes("dvh"))).toEqual([]);
  });

  it("appears WHERE IT STAYS: one fade, motion-safe — never a travel from the screen's edge, on any screen", () => {
    const markup = dialog();
    const animations = [...markup.matchAll(/(\S*)animate-\[[^\]]+\]/g)].map((match) => match[0]);
    for (const animation of animations) expect(animation).toMatch(/motion-safe:/);
    // The panel: ONE entrance for the sheet and the modal alike; the backdrop: its own fade.
    expect(panel(markup).filter((name) => name.includes("animate-"))).toEqual(["motion-safe:animate-[bz-fade_var(--bz-duration-disclosure)_var(--bz-ease-out)_both]"]);
    expect(markup).not.toMatch(/bz-sheet-in|bz-dialog-in|translate/);
    const motion = readFileSync(path.join(__dirname, "../../../styles/motion.css"), "utf8");
    expect(motion).not.toMatch(/bz-sheet-in|bz-dialog-in/);
    // bz-fade only changes the opacity: the first frame is the final place.
    expect(motion).toMatch(/@keyframes bz-fade \{ from \{ opacity: 0; \} \}/);
  });

  it("the stateful dialog renders the same markup (the browser shows it, then focuses « Fermer le détail »)", () => {
    const markup = renderToStaticMarkup(<ServiceDetailDialog service={soin} returnFocusRef={{ current: null }} onClosed={noop} />);
    expect(markup).toMatch(/^<dialog /);
    expect(markup).toContain("Fermer le détail");
  });
});
