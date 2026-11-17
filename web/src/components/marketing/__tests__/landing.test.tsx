import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The screenshots are static WebP imports (Next.js gives them a size and a
// blur placeholder at build time); here every one is a stand-in of the same shape.
vi.mock("../screens", () => {
  const screen = (name: string) => ({
    image: { src: `/_next/static/media/${name}.webp`, width: 1206, height: 2622, blurDataURL: "data:image/webp;base64,AA==" },
    alt: `Capture ${name}`,
  });
  return { SCREENS: new Proxy({}, { get: (_target, name) => screen(String(name)) }) };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function landing(contactEmail?: string) {
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", contactEmail ?? "");
  vi.resetModules();
  const { default: HomePage } = await import("@/app/(marketing)/page");
  const { MARKETING_NAV } = await import("@/components/layout/site-header");
  const { SiteFooter } = await import("../site-footer");
  const html = renderToStaticMarkup(
    <>
      <HomePage />
      <SiteFooter />
    </>,
  );
  return { html, nav: MARKETING_NAV };
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ");
/** The markup of one section, by its id. */
const section = (html: string, id: string) => {
  const start = html.indexOf(`id="${id}"`);
  return html.slice(start, html.indexOf("</section>", start));
};

describe("the landing page", () => {
  it("has one title, and every anchor of the navigation lands on a section", async () => {
    const { html, nav } = await landing();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    for (const { href } of nav) expect(html).toContain(`id="${href.replace("/#", "")}"`);
    for (const id of ["agenda", "caisse", "tendances", "produits", "clientele"]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
  });

  it("opens on the whole product: the hero tours five modules, and is no longer about processing time", async () => {
    const { html } = await landing();
    const hero = html.slice(0, html.indexOf('id="fonctionnalites"'));
    expect(text(hero)).toContain("Votre activité beauté, simplement maîtrisée.");
    expect(hero).toContain('aria-label="Les modules de BeautIzzy"');
    const tabs = [...hero.matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map(([, tab]) => text(tab));
    expect(tabs.map((tab) => tab.trim())).toEqual(["Agenda", "Caisse", "Clientèle", "Produits", "Tops"]);
    expect(text(hero)).not.toMatch(/temps de pose/i);
  });

  it("tours are real tabs: one selected, the others hidden from assistive technologies and inert", async () => {
    const { html } = await landing();
    expect(html.match(/role="tablist"/g)).toHaveLength(3); // hero, clients, online booking
    const panels = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
    expect(panels.filter((panel) => panel.includes('data-active="true"'))).toHaveLength(3);
    for (const panel of panels.filter((candidate) => candidate.includes('data-active="false"'))) {
      expect(panel).toContain('aria-hidden="true"');
      expect(panel).toMatch(/\binert\b/);
    }
  });

  it("every demonstration offers « Revoir », hidden until a script can actually replay it", async () => {
    const { html } = await landing();
    const replays = html.match(/<button[^>]*hidden[^>]*>[\s\S]*?Revoir<span class="sr-only"> la démonstration : [^<]+<\/span><\/button>/g) ?? [];
    expect(replays).toHaveLength(4); // agenda, caisse, tops, produits
  });

  it("renders the FINAL state of every demonstration on the server (no JavaScript, crawlers, reduced motion)", async () => {
    const { html } = await landing();
    expect(html).not.toContain("data-demo=");
    expect(html).not.toContain("data-reveal");
    const page = text(html).replace(/ | /g, " ");
    expect(page).toContain("339,00 €"); // the receipt's CA potentiel
    expect(page).toContain("Sofia J.");
    expect(page).toContain("Encaissé · 24,00 € · stock à jour");
  });

  it("the Agenda never claims that BeautIzzy places an appointment by itself", async () => {
    const agenda = text(section((await landing()).html, "agenda"));
    expect(agenda).toContain("Hugo, ajouté par vous");
    expect(agenda).toContain("BeautIzzy ne place rien à votre place");
  });

  it("never confuses the Résumé du jour with the Caisse", async () => {
    const cash = text(section((await landing()).html, "caisse"));
    expect(cash).toContain("Résumé du jour");
    expect(cash).toContain("CA potentiel");
    expect(cash).toContain("La Caisse, ce mois-ci : l’argent réellement encaissé.");
  });

  it("the podium's eye is a real toggle; this demonstration of fictional figures starts with the client amounts WRITTEN", async () => {
    const tops = section((await landing()).html, "tendances");
    // Unlike the app (masked at every opening), the marketing demo shows them: not pressed, amounts readable.
    expect(tops).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="Masquer les montants des clients"/);
    for (const amount of ["159,00", "107,00", "76,30"]) expect(text(tops)).toContain(amount);
    expect(text(tops)).toContain("Les montants des clients sont affichés.");
    // The three masks wait in place, hidden from sight and from assistive technologies.
    expect(tops.match(/<span aria-hidden="true" class="[^"]*invisible[^"]*"><span class="sr-only">Montant masqué<\/span>/g)).toHaveLength(3);
    const labels = [...tops.matchAll(/aria-label="([^"]*)"/g)].map(([, label]) => label);
    for (const label of labels) expect(label).not.toMatch(/\d+,\d{2}/);
  });

  it("the podium's amounts are rendered at their FINAL values (no JavaScript, reduced motion), and count up from there with the scene", async () => {
    const tops = section((await landing()).html, "tendances");
    // Each client amount is a DemoNumber: the final value written, its moving digits hidden, spoken once.
    for (const amount of ["159,00", "107,00", "76,30"]) {
      expect(tops).toMatch(new RegExp(`<span aria-hidden="true" class="tabular-nums">${amount}[^<]*</span><span class="sr-only">${amount}`));
    }
    // Written by default: no amount sits in a hidden layer.
    expect(tops).not.toMatch(/<span aria-hidden="true" class="[^"]*invisible[^"]*"><span><span aria-hidden="true" class="tabular-nums">/);
  });

  it("« Revoir » replays a scene without re-rendering it, so a choice made in the demo (masked amounts) survives the replay", () => {
    const scene = readFileSync(path.join(__dirname, "../../motion/demo-scene.tsx"), "utf8");
    // The scene only switches `data-demo` on itself: no React state, no remount key.
    expect(scene).not.toMatch(/useState|useReducer|\bkey=/);
    expect(scene).toContain('scene.dataset.demo = "play"');
  });

  it("Tops & tendances: save or share the GENUINE exported image — services, turnover frosted, never a client ranking pushed to the public", async () => {
    const tops = section((await landing()).html, "tendances");
    const page = text(tops);
    expect(page).not.toContain("Image enregistrée dans Photos"); // a marketing page saves nothing
    expect(page).toContain("Aperçu prêt à enregistrer ou partager");
    expect(page).toContain("L’image · Top prestations");
    expect(page).toContain("Le ticket · vos clients");
    expect(page).toMatch(/Enregistrer[\s\S]*Partager/);
    expect(tops).toContain("shareTopsPrestations.webp"); // next/image encodes the path
    expect(page).toContain("votre chiffre d’affaires reste flouté");
    expect(page).toContain("un classement de clients ne se publie qu’avec leur accord");
    expect(page).not.toMatch(/instagram|facebook|tiktok/i);
  });

  it("Clientèle: manual tabs only — no Play, Pause or Revoir, no timer", async () => {
    const markup = section((await landing()).html, "clientele");
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('data-mode="manual"');
    expect(markup).not.toContain("data-offscreen");
    expect(text(markup)).not.toMatch(/\b(Pause|Reprendre|Lecture|Revoir)\b/);
  });

  it("online booking: ONE automatic pass (mode once), « Revoir » only after it — its row reserved, no Pause", async () => {
    const markup = section((await landing()).html, "reservation-en-ligne");
    expect(markup).toContain('data-mode="once"');
    expect(markup).toContain('data-tour="playing"');
    expect(markup).toMatch(/<div class="flex min-h-11 justify-end"><\/div>/); // the reserved row, empty until the pass ends
    expect(text(markup)).not.toMatch(/\b(Pause|Reprendre)\b/);
    expect(markup).not.toMatch(/turnstile|challenges\.cloudflare/i);
  });

  it("the hero has ONE playback control, naming its action with the matching icon, invisible until a script drives it", async () => {
    const { html } = await landing();
    const hero = html.slice(0, html.indexOf('id="fonctionnalites"'));
    const controls = hero.match(/<button type="button" class="tour-cell[^"]*"[\s\S]*?<\/button>/g) ?? [];
    expect(controls).toHaveLength(1);
    const control = controls[0] ?? "";
    expect(control).toContain("tour-control"); // hidden by CSS until a script drives it
    expect(hero).not.toContain("data-scripted");
    expect(text(control)).toContain("Pause du défilement automatique");
    expect(control).toContain("<rect"); // the pause glyph, never the play glyph beside « Pause »
    expect(text(hero)).not.toContain("Reprendre");
  });

  it("progress lines have their own track UNDER the label, never positioned over it", async () => {
    const { html } = await landing();
    const hero = html.slice(0, html.indexOf('id="fonctionnalites"'));
    const tabs = hero.match(/<button[^>]*role="tab"[\s\S]*?<\/button>/g) ?? [];
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) {
      expect(tab).toMatch(/<span class="max-w-full truncate leading-4[^"]*">[^<]+<\/span><\/span><span aria-hidden="true" class="tour-track mx-3 block h-\[2px\]/);
      expect(tab).not.toMatch(/tour-track[^"]*absolute/);
    }
  });

  it("the Agenda says the second appointment is added by the professional; the receipt is not a payment receipt", async () => {
    const { html } = await landing();
    expect(text(section(html, "agenda"))).toContain("Vous ajoutez un rendez-vous");
    expect(text(section(html, "caisse"))).toContain("Un récapitulatif de la journée, pas un reçu de paiement.");
  });

  it("says that online booking is not open, and that the screens show fictional data", async () => {
    const page = text((await landing()).html);
    expect(page).toContain("La réservation en ligne n’est pas encore ouverte au public.");
    expect(page).toContain("En préparation");
    expect(page).toMatch(/données de démonstration fictives/);
    expect(page).toContain("aucune réservation envoyée");
  });

  it("pricing: one plan, a native billing switch on the annual plan, every figure exact, no pressure", async () => {
    const pricing = section((await landing()).html, "tarif");
    expect(pricing).toContain("<fieldset");
    expect(pricing).toMatch(/<input type="radio"[^>]*name="billing" value="monthly"\/>/);
    expect(pricing).toMatch(/<input type="radio"[^>]*name="billing" checked="" value="annual"/);
    const page = text(pricing).replace(/ | /g, " ");
    for (const figure of ["12,99 €", "129 €", "soit 10,75 € par mois", "−17 %", "26,88 €", "155,88 €", "14 jours"]) expect(page).toContain(figure);
    expect(page).toContain("12,99 € / mois");
    expect(page).toContain("129 € / an");
    expect(page).toContain("le prix affiché au moment de l’achat fait foi");
    expect(page).not.toMatch(/offre limitée|expire|derni[eè]res? places?|plus que \d/i);
  });

  it("without a contact address: no call to action at all, never a dead link", async () => {
    const { html } = await landing();
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("Demander un accès");
  });

  it("with a contact address: the calls to action write to it", async () => {
    const { html } = await landing("bonjour@example.test");
    expect(html.match(/href="mailto:bonjour@example\.test\?subject=/g)).toHaveLength(3); // hero, pricing, final call
  });

  it("loads nothing from a third party and links to no page that does not exist", async () => {
    const { html } = await landing("bonjour@example.test");
    expect(html).not.toMatch(/<iframe|<script/);
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(html).not.toMatch(/mentions|confidentialit|cgu|cgv/i);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
    for (const href of hrefs) expect(href).toMatch(/^(#|\/#|mailto:)/);
  });

  it("describes every image (the overview tiles' are decorative: each screen is described in its own section)", async () => {
    const { html } = await landing();
    const images = html.match(/<img\b[^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(10);
    for (const image of images) expect(image).toMatch(/\balt="/);
  });

  it("the footer is anchored by the brand and lists no legal page that does not exist", async () => {
    const { html } = await landing();
    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).toContain('alt="BeautIzzy"');
    expect(footer).toContain("Découvrir");
    expect(footer).toContain("L’ouverture au public est en préparation.");
  });
});

describe("the podium's eye", () => {
  it("not pressed while the amounts are written: the open eye is drawn", async () => {
    const { AmountsEye } = await import("../podium-demo");
    const html = renderToStaticMarkup(<AmountsEye masked={false} onToggle={() => undefined} />);
    expect(html).toMatch(/^<button type="button" aria-pressed="false" aria-label="Masquer les montants des clients"/);
    const [open, crossed] = [...html.matchAll(/<svg[^>]*class="([^"]*)"/g)].map(([, classes]) => classes);
    expect(open).toContain("opacity-100");
    expect(crossed).toContain("opacity-0");
  });

  it("pressed once the amounts are masked: the crossed eye is drawn", async () => {
    const { AmountsEye } = await import("../podium-demo");
    const html = renderToStaticMarkup(<AmountsEye masked onToggle={() => undefined} />);
    expect(html).toMatch(/^<button type="button" aria-pressed="true"/);
    const [open, crossed] = [...html.matchAll(/<svg[^>]*class="([^"]*)"/g)].map(([, classes]) => classes);
    expect(open).toContain("opacity-0");
    expect(crossed).toContain("opacity-100");
  });
});

describe("the podium's client amounts", () => {
  it("written: the amount is spoken, the mask is hidden", async () => {
    const { ClientAmount } = await import("../podium-demo");
    const html = renderToStaticMarkup(<ClientAmount cents={15900} first masked={false} countDelay={0} />);
    expect(text(html)).toContain("159,00");
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*invisible[^"]*"><span class="sr-only">Montant masqué/);
  });

  it("masked: the amount is neither shown nor spoken, the mask says so, and the place keeps its size", async () => {
    const { ClientAmount } = await import("../podium-demo");
    const html = renderToStaticMarkup(<ClientAmount cents={15900} first masked countDelay={0} />);
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*invisible[^"]*"><span><span aria-hidden="true" class="tabular-nums">159,00/);
    expect(html).toMatch(/<span class="[^"]*opacity-100[^"]*"><span class="sr-only">Montant masqué<\/span>/);
    expect(html).toContain("col-start-1 row-start-1"); // stacked in one cell: no jump
  });
});

describe("the landing page's motion", () => {
  const css = readFileSync(path.join(__dirname, "../../../styles/marketing.css"), "utf8");

  it("transitions only compositor-friendly properties (and visibility or colours, which never lay out)", () => {
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map(([, value]) => value);
    expect(transitions.length).toBeGreaterThan(0);
    for (const value of transitions) {
      for (const part of value.split(/,(?![^(]*\))/)) expect(part.trim().split(/\s+/)[0]).toMatch(/^(opacity|transform|clip-path|visibility|color|background-color)$/);
    }
  });

  it("animates only transform and opacity in its keyframes — never a layout property, never a filter", () => {
    const frames = [...css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n?\}\n/g)].map(([, body]) => body);
    expect(frames.length).toBeGreaterThan(10);
    for (const body of frames) {
      const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map(([, property]) => property);
      for (const property of properties) expect(property).toMatch(/^(opacity|transform|animation-timing-function)$/);
    }
    expect(css).not.toMatch(/(^|[;{\s])filter\s*:/);
  });

  it("an advancing tour stops under reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*:is\(\.tour-fill, \.tour-rest, \.tour-hold\) \{ animation: none !important; \}/);
  });
});
