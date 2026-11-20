import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { directionsLinks, type DirectionsLinks } from "@/features/location/directions";

import { DirectionsChooserView, DirectionsTrigger, DirectionsTriggerAnchor } from "../directions-chooser";

const DESTINATION = "12 avenue Jean Jaurès, 69007 Lyon";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
/** iPadOS Safari asking for desktop websites, its default: a Mac to the server. */
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";
const onIphone = directionsLinks(DESTINATION, { userAgent: IPHONE }) as DirectionsLinks;
const onIpadAsMac = directionsLinks(DESTINATION, { userAgent: IPAD_AS_MAC }) as DirectionsLinks;
const onAndroid = directionsLinks(DESTINATION, { userAgent: ANDROID }) as DirectionsLinks;
const noop = () => undefined;

const chooser = (links: DirectionsLinks = onIphone) => renderToStaticMarkup(<DirectionsChooserView directions={links} spoken={DESTINATION} onClose={noop} onChoose={noop} />);
const anchors = (markup: string) => [...markup.matchAll(/<a ([^>]*)>/g)].map((match) => match[1] ?? "");
const attribute = (tag: string, name: string) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const panel = (markup: string) => /<div data-dialog-panel="" class="([^"]+)"/.exec(markup)?.[1].split(" ") ?? [];

describe("the trigger — a link first, the chooser's button on an iPhone or an iPad", () => {
  it("as the server sends it (and without JavaScript): the plain link to the platform's application", () => {
    const markup = renderToStaticMarkup(
      <DirectionsTrigger directions={onIphone} spoken={DESTINATION}>
        Itinéraire
      </DirectionsTrigger>,
    );
    const [tag] = anchors(markup);
    expect(attribute(tag!, "href")).toBe(onIphone.primary.url.replace(/&/g, "&amp;"));
    expect(attribute(tag!, "target")).toBe("_blank");
    expect(attribute(tag!, "rel")).toBe("noopener noreferrer");
    expect(tag).not.toMatch(/role=|aria-haspopup|data-chooser/);
    // Nothing of the chooser exists until it is asked for.
    expect(markup).not.toContain("<dialog");
  });

  it("on an iPhone or an iPad, once the page runs: a button that opens a dialog, said as such — the link kept underneath", () => {
    const markup = renderToStaticMarkup(
      <DirectionsTriggerAnchor directions={onIphone} spoken={DESTINATION} chooser>
        Itinéraire
      </DirectionsTriggerAnchor>,
    );
    const [tag] = anchors(markup);
    expect(attribute(tag!, "role")).toBe("button");
    expect(attribute(tag!, "aria-haspopup")).toBe("dialog");
    expect(attribute(tag!, "aria-label")).toBe("Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon : choisir l’application");
    expect(tag).toContain('data-chooser=""');
    // A modified click, or a browser without the script, still has the link.
    expect(attribute(tag!, "href")).toBe(onIphone.primary.url);
  });

  it("on Android, a direct link to Google Maps that names its application — no chooser to go through", () => {
    expect(onAndroid.chooser).toBeUndefined();
    expect(onAndroid.primary.provider).toBe("google");
    const [tag] = anchors(
      renderToStaticMarkup(
        <DirectionsTriggerAnchor directions={onAndroid} spoken={DESTINATION} chooser={false}>
          Itinéraire
        </DirectionsTriggerAnchor>,
      ),
    );
    expect(attribute(tag!, "aria-label")).toBe("Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon (Google Maps, nouvel onglet)");
  });

  it("opens the chooser on a tap, and on Space as a button — Enter is the link's own click", () => {
    const source = readFileSync(path.join(__dirname, "../directions-chooser.tsx"), "utf8");
    expect(source).toMatch(/if \(!opensChooser\(chooser, event\)\) return;\s*event\.preventDefault\(\);\s*setOpen\(true\);/);
    expect(source).toMatch(/if \(!chooser \|\| event\.key !== " "\) return;/);
    // Mounted only once asked for, into the body: it never inherits the text styles of a summary around its trigger.
    expect(source).toMatch(/createPortal\(<DirectionsChooserDialog [\s\S]*?\/>, document\.body\)/);
    // The platform comes from the server; the touch screen is read in the browser only — the server and the hydration
    // render the link (the same markup on both sides), and the chooser arrives right after.
    expect(source).toMatch(/useSyncExternalStore\(subscribeNothing, \(\) => chooserActive\(directions, \{ touchScreen: browserHasTouchScreen\(\) \}\), \(\) => false\)/);
    expect(source).toMatch(/hasTouchScreen\(typeof navigator === "undefined" \? undefined : navigator\)/);
    expect(source).not.toMatch(/matchMedia|pointer: coarse|userAgent/);
  });
});

describe("« Ouvrir avec » — a real dialog", () => {
  it("is a native <dialog>, titled « Ouvrir avec », described by the destination", () => {
    const markup = chooser();
    expect(markup).toMatch(/^<dialog /);
    const titleId = attribute(markup.match(/<dialog ([^>]*)>/)![1]!, "aria-labelledby");
    const descriptionId = attribute(markup.match(/<dialog ([^>]*)>/)![1]!, "aria-describedby");
    expect(markup).toMatch(new RegExp(`<h2 id="${titleId}"[^>]*>Ouvrir avec</h2>`));
    expect(markup).toMatch(new RegExp(`<p id="${descriptionId}"[^>]*>Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon</p>`));
  });

  it("is hidden until the browser shows it as a modal (`showModal`): never in the page's flow, never open by itself", () => {
    const classes = attribute(chooser().match(/<dialog ([^>]*)>/)![1]!, "class")?.split(" ") ?? [];
    expect(classes).toEqual(expect.arrayContaining(["hidden", "open:flex", "fixed", "inset-0", "border-0", "bg-transparent"]));
    expect(chooser()).not.toMatch(/<dialog[^>]*\sopen(=|\s|>)/);
  });

  it("closes with « Fermer », a real button placed before the list (the first focus) — and locks the page's scroll", () => {
    const markup = chooser();
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toMatch(/<button type="button" aria-label="Fermer"[^>]*>/);
    expect(markup.indexOf('aria-label="Fermer"')).toBeLessThan(markup.indexOf("<ul"));
    expect(markup).toMatch(/<dialog[^>]*data-scroll-lock=""/);
    const source = readFileSync(path.join(__dirname, "../directions-chooser.tsx"), "utf8");
    // Escape, the backdrop and the focus going back to the trigger: the browser's modal and presentModalDialog.
    expect(source).toMatch(/presentModalDialog\(dialog, \{\s*initialFocus: closeRef\.current,\s*returnFocus: returnFocusRef\.current,/);
  });
});

describe("« Ouvrir avec » — exactly two applications", () => {
  it("on an iPhone or an iPad: Apple Plans, then Google Maps — each named, nothing else", () => {
    const markup = chooser(onIphone);
    expect(anchors(markup).map((tag) => attribute(tag, "data-provider"))).toEqual(["apple", "google"]);
    expect(text(markup)).toContain("Apple Plans Google Maps L’application");
    expect(markup).not.toMatch(/waze/i);
  });

  it("an iPad presenting itself as a Mac: the very same two", () => {
    const markup = chooser(onIpadAsMac);
    expect(anchors(markup).map((tag) => attribute(tag, "data-provider"))).toEqual(["apple", "google"]);
    expect(markup).not.toMatch(/waze/i);
  });

  it("each row is a link to its application, in a new tab — what a screen reader hears names it first", () => {
    for (const tag of anchors(chooser())) {
      expect(attribute(tag, "target")).toBe("_blank");
      expect(attribute(tag, "rel")).toBe("noopener noreferrer");
      expect(attribute(tag, "href")).toMatch(/^https:\/\/(maps\.apple\.com\/directions\?|www\.google\.com\/maps\/dir\/\?)/);
      expect(attribute(tag, "aria-label")).toMatch(/^(Apple Plans|Google Maps) : itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon \(nouvel onglet\)$/);
      // A comfortable target on a phone.
      expect(attribute(tag, "class")).toContain("min-h-14");
    }
  });

  it("shows each application's small mark beside its name — decorative, never instead of it", () => {
    const markup = chooser();
    for (const provider of ["apple", "google"]) expect(markup).toContain(`data-provider-mark="${provider}"`);
    expect(markup.match(/data-provider-mark=/g)).toHaveLength(2);
    expect(markup).toMatch(/<span aria-hidden="true" class="grid size-10[^"]*"><svg/);
  });

  it("promises nothing about the device, and says what a tap does", () => {
    expect(text(chooser())).toContain("L’application s’ouvre si elle est installée sur cet appareil, sinon son site.");
  });
});

describe("« Ouvrir avec » — a bottom sheet on a phone, a small panel on a tablet", () => {
  it("phone: anchored to the bottom, above the home indicator (safe area), as tall as its rows", () => {
    const markup = chooser();
    expect(attribute(markup.match(/<dialog ([^>]*)>/)![1]!, "class")?.split(" ")).toEqual(expect.arrayContaining(["items-end", "justify-center"]));
    // The last row stays clear of the screen's bottom edge (the note under it, then at least 1rem); its height
    // never follows Safari's toolbars: the SMALL viewport (svh), never the dynamic one (dvh).
    expect(panel(markup)).toEqual(
      expect.arrayContaining(["w-full", "rounded-t-[1.75rem]", "pb-[max(1rem,env(safe-area-inset-bottom))]", "max-h-[85vh]", "supports-[height:100svh]:max-h-[85svh]"]),
    );
    expect(panel(markup).filter((name) => name.includes("dvh"))).toEqual([]);
    expect(markup.indexOf('data-provider="google"')).toBeLessThan(markup.indexOf("L’application s’ouvre"));
    expect(markup).toMatch(/<div aria-hidden="true" class="[^"]*h-1\.5 w-10[^"]*sm:hidden"><\/div>/);
  });

  it("tablet: centred, narrow, rounded all around", () => {
    const markup = chooser();
    expect(attribute(markup.match(/<dialog ([^>]*)>/)![1]!, "class")?.split(" ")).toEqual(expect.arrayContaining(["sm:items-center", "sm:p-6"]));
    expect(panel(markup)).toEqual(expect.arrayContaining(["sm:max-w-[26rem]", "sm:rounded-[1.75rem]"]));
  });

  it("appears WHERE IT STAYS — one fade, only when motion is welcome: a row is where a finger lands from the first frame", () => {
    const markup = chooser();
    const animations = [...markup.matchAll(/(\S*)animate-\[[^\]]+\]/g)].map((match) => match[0]);
    for (const animation of animations) expect(animation).toMatch(/motion-safe:/);
    // ONE entrance for the sheet and the tablet panel alike — never a travel from the screen's edge.
    expect(panel(markup).filter((name) => name.includes("animate-"))).toEqual(["motion-safe:animate-[bz-fade_var(--bz-duration-disclosure)_var(--bz-ease-out)_both]"]);
    expect(markup).not.toMatch(/bz-sheet-in|bz-dialog-in|translate/);
  });
});

describe("« Ouvrir avec » — never a surprise", () => {
  it("never redirects by itself, never tries an application scheme, never asks for a position", () => {
    const source = readFileSync(path.join(__dirname, "../directions-chooser.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(source).not.toMatch(/window\.location|location\.(href|assign|replace)|window\.open|setTimeout|setInterval|geolocation|getCurrentPosition/);
    expect(source).not.toMatch(/waze:\/\/|comgooglemaps|maps:\/\/|geo:|intent:/);
    expect(chooser()).not.toMatch(/<script|javascript:|onclick=/i);
  });

  it("a chosen row only closes the sheet after the browser opened the link — the page behind keeps its state", () => {
    const source = readFileSync(path.join(__dirname, "../directions-chooser.tsx"), "utf8");
    // The row's own default action opens the application; onChoose merely closes the dialog.
    expect(source).toMatch(/onClick=\{onChoose\}/);
    expect(source).toMatch(/onChoose=\{close\}/);
    expect(source).not.toMatch(/onChoose[^\n]*preventDefault/);
  });
});
