import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BookableService } from "@/features/availability/availability";

import { ServiceStep, type Professional } from "../booking-steps";
import { ServiceCard, ServiceCardView } from "../service-card";

/** The no-break spaces Intl writes in prices, built from code points (no invisible character in the source). */
const SPACES = new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', "g");
const noop = () => undefined;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(SPACES, " ");
const professional: Professional = { name: "Atelier Lumière", phone: "04 78 00 00 00" };

const DESCRIPTION = "Un soin complet en trois temps.\n\nNettoyage, gommage puis masque.\nVenez sans maquillage.";
const soin: BookableService = {
  id: "svc-soin",
  name: "Soin du visage avec masque",
  durationMinutes: 75,
  description: DESCRIPTION,
  priceCents: 8900,
  category: { id: "cat-visage", name: "Soins du visage", position: 0 },
};
const brushing: BookableService = { id: "svc-brushing", name: "Brushing", durationMinutes: 30, priceCents: 0 };
const legacy: BookableService = { id: "svc-coupe", name: "Coupe", durationMinutes: 45 };

const view = (props: Partial<Parameters<typeof ServiceCardView>[0]> = {}) =>
  renderToStaticMarkup(
    <ServiceCardView service={soin} selected={false} headingLevel={3} onChoose={noop} expanded={false} truncated={false} onToggleDetail={noop} {...props} />,
  );

describe("ServiceCard — what a customer reads", () => {
  it("shows the name, the duration, the server's price and the description", () => {
    const html = text(view());
    expect(html).toContain("Soin du visage avec masque");
    expect(html).toContain("1 h 15");
    expect(html).toContain("89 €");
    expect(html).toContain("Un soin complet en trois temps.");
  });

  it("reads a price of 0 as « Tarif à confirmer », never free", () => {
    const html = text(view({ service: brushing }));
    expect(html).toContain("Tarif à confirmer");
    expect(html).not.toMatch(/gratuit|0 €|0,00/i);
  });

  it("shows no price, no description and no detail control when the server gave none (an older server)", () => {
    const markup = view({ service: legacy, truncated: true });
    expect(markup).not.toContain("data-price");
    expect(markup).not.toMatch(/€|Tarif/);
    expect(markup).not.toContain("data-collapsed");
    expect(markup).not.toContain("Voir le détail");
    expect(text(markup)).toContain("Coupe");
    expect(text(markup)).toContain("45 min");
  });

  it("never suggests a payment", () => {
    expect(text(view())).not.toMatch(/payer|paiement|régler|carte bancaire|en ligne maintenant/i);
  });
});

describe("ServiceCard — the description", () => {
  it("shows two lines first, its line breaks kept, as text", () => {
    const markup = view();
    expect(markup).toMatch(/<p[^>]*data-collapsed=""[^>]*class="[^"]*whitespace-pre-line[^"]*max-h-\[2lh\] overflow-hidden[^"]*"[^>]*>Un soin complet/);
    expect(markup).toContain("Un soin complet en trois temps.\n\nNettoyage, gommage puis masque.\nVenez sans maquillage.");
  });

  it("offers « Voir le détail » only when the two lines hide part of it", () => {
    expect(view({ truncated: false })).not.toContain("Voir le détail");
    const markup = view({ truncated: true });
    expect(markup).toMatch(/<button type="button" aria-expanded="false" aria-controls="([^"]+)"[^>]*>Voir le détail/);
    // The control points at the description it opens.
    const controls = /aria-controls="([^"]+)"/.exec(markup)?.[1];
    expect(markup).toContain(`<p id="${controls}"`);
  });

  it("shows the whole text once opened, and « Réduire » to close it again", () => {
    const markup = view({ truncated: true, expanded: true });
    expect(markup).not.toContain("data-collapsed");
    expect(markup).not.toContain("max-h-[2lh]");
    expect(markup).toMatch(/<button type="button" aria-expanded="true"[^>]*>Réduire/);
    expect(markup).not.toContain("Voir le détail");
  });

  it("clips at two lines without the browser's ellipsis, and fades the second line only when text is hidden", () => {
    // line-clamp drew « … » right after the period of a paragraph ending the second
    // line (« lumineux.… »): the collapsed text is clipped instead, with no ellipsis glyph.
    for (const truncated of [false, true]) {
      const markup = view({ truncated });
      expect(markup).not.toMatch(/line-clamp|text-ellipsis|truncate/);
      expect(markup).not.toContain("…");
    }
    expect(view({ truncated: false })).not.toContain("after:bg-[linear-gradient");
    expect(view({ truncated: true })).toMatch(/<p[^>]*data-collapsed=""[^>]*class="[^"]*after:bg-\[linear-gradient\(to_right,transparent,var\(--color-background\)\)\]/);
    expect(view({ truncated: true, expanded: true })).not.toContain("after:bg-[linear-gradient");
    // The text itself is never shortened: the whole description is always in the page.
    expect(view({ truncated: true })).toContain("Venez sans maquillage.");
  });

  it("never renders a description as markup", () => {
    const markup = view({ service: { ...soin, description: '<img src=x onerror="alert(1)"><b>gras</b>' } });
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<b>");
    expect(markup).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&lt;b&gt;gras&lt;/b&gt;");
  });

  it("renders no detail control before the browser measured the text (the stateful card)", () => {
    const markup = renderToStaticMarkup(<ServiceCard service={soin} selected={false} headingLevel={3} onChoose={noop} />);
    expect(markup).toContain("max-h-[2lh]");
    expect(markup).not.toContain("Voir le détail");
  });
});

describe("ServiceCard — two distinct actions", () => {
  it("never nests a button in a button, and names the choice after its service", () => {
    const markup = view({ truncated: true });
    expect(markup.match(/<button/g)).toHaveLength(2);
    // Each button closes before the next one opens: never one inside another.
    expect([...markup.matchAll(/<button|<\/button>/g)].map((m) => m[0])).toEqual(["<button", "</button>", "<button", "</button>"]);
    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Choisir<span class="sr-only"> Soin du visage avec masque<\/span><\/button>/);
    expect(markup).toMatch(/^<article aria-labelledby="([^"]+)"/);
  });

  it("marks the chosen service", () => {
    const markup = view({ selected: true });
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>/);
    expect(markup).toContain("border-accent");
  });

  it("waits while the list is being read again", () => {
    expect(view({ disabled: true })).toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled=""/);
  });

  it("titles itself at the level its list asks for", () => {
    expect(view({ headingLevel: 3 })).toMatch(/<h3 id="[^"]+-name"/);
    expect(view({ headingLevel: 4 })).toMatch(/<h4 id="[^"]+-name"/);
  });
});

describe("ServiceStep — the list", () => {
  const step = (services: readonly BookableService[], selectedId?: string) =>
    renderToStaticMarkup(<ServiceStep services={services} selectedId={selectedId} professional={professional} onChoose={noop} />);

  it("keeps the plain list of an older server: no heading, no price, no description", () => {
    const markup = step([legacy, { id: "svc-balayage", name: "Balayage", durationMinutes: 150 }]);
    expect(markup).not.toMatch(/<h3[^>]*id="booking-services-/);
    expect(markup).not.toMatch(/€|Tarif|indicatifs/);
    expect(markup.match(/<article/g)).toHaveLength(2);
    expect(markup).toMatch(/<h3 id="[^"]+-name"[^>]*>Coupe<\/h3>/);
  });

  it("groups by her categories, in her order, the others last, cards titled one level below", () => {
    const epilation = { id: "cat-epilation", name: "Épilations", position: 1 };
    const markup = step([
      { ...legacy, id: "svc-sourcils", name: "Épilation sourcils", category: epilation },
      soin,
      brushing,
    ]);
    const headings = [...markup.matchAll(/<h3 id="booking-services-[^"]+"[^>]*><span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(headings).toEqual(["Soins du visage", "Épilations", "Autres prestations"]);
    expect(markup).toMatch(/<h4 id="[^"]+-name"[^>]*>Soin du visage avec masque<\/h4>/);
    // Reading order follows the groups.
    expect(markup.indexOf("Soin du visage avec masque")).toBeLessThan(markup.indexOf("Épilation sourcils"));
    expect(markup.indexOf("Épilation sourcils")).toBeLessThan(markup.indexOf("Brushing"));
  });

  it("says prices are indicative, once, when a price is shown", () => {
    const html = text(step([soin, brushing]));
    expect(html.match(/Les tarifs affichés sont indicatifs\./g)).toHaveLength(1);
  });

  it("marks the ONE chosen service", () => {
    const markup = step([soin, brushing, legacy], "svc-brushing");
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(2);
  });

  it("still says so, with the contact, when nothing is offered online", () => {
    const html = text(step([]));
    expect(html).toContain("Aucune prestation n’est proposée en ligne pour le moment.");
    expect(html).toContain("04 78 00 00 00");
  });
});
