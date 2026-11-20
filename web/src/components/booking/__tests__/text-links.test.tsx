import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BookableService } from "@/features/availability/availability";
import type { LocationView } from "@/features/location/location-view";
import type { PublicProfile } from "@/features/public-profile/public-profile";

import { AppointmentSummary, ContactLinks, DetailsStep, ReviewStep, SlotStep, type Professional } from "../booking-steps";
import { DirectionsActions, LocationLines } from "../location-card";
import { PublicProfileView } from "../public-profile-view";
import { ServiceCardView } from "../service-card";
import { LINK_FEEDBACK, TEXT_LINK } from "../text-link";

/**
 * Step 196: the links of the public booking pages are never underlined — no
 * text decoration, and no border or pseudo-element drawing one instead — in any
 * state, while they stay links and buttons with their destinations, their
 * colour answering a hover or a press, and the site's keyboard focus ring.
 */

/** The class tokens that draw a line under a text: a decoration, or a border or a pseudo-element imitating one. */
const LINE = /^(?:[\w-]+:)*(underline|no-underline|underline-offset-.+|decoration-.+|border-b(?:-.+)?|after:.+|before:.+|shadow-\[inset.+)$/;
const lines = (classes: string) => classes.split(/\s+/).filter((name) => LINE.test(name));
const classOf = (tag: string) => /\sclass="([^"]*)"/.exec(tag)?.[1] ?? "";
const noop = () => undefined;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&destination=12%20rue%20des%20Lilas%2C%2069001%20Lyon";
const address: LocationView = {
  kind: "address",
  lines: ["12 rue des Lilas", "69001 Lyon"],
  spoken: "12 rue des Lilas, 69001 Lyon",
  directions: { primary: { provider: "google", providerName: "Google Maps", url: GOOGLE_URL } },
};
const professional: Professional = { name: "Studio Esthétique", location: address, phone: "04 78 00 00 00", email: "bonjour@studio.example" };
const coupe: BookableService = { id: "svc-coupe", name: "Coupe", durationMinutes: 45, priceCents: 4500, description: "Shampoing, coupe et coiffage." };
const slot = { startsAt: "2026-11-16T13:00:00Z", endsAt: "2026-11-16T13:45:00Z", localTime: "14:00" };

describe("the shared style of a public text link", () => {
  it("draws no line in any state — a colour answers a hover or a press", () => {
    for (const style of [TEXT_LINK, LINK_FEEDBACK]) {
      expect(lines(style)).toEqual([]);
      expect(style).not.toMatch(/outline-none|outline-0/);
    }
    expect(TEXT_LINK.split(" ")).toEqual(expect.arrayContaining(["font-medium", "text-lavender-700", "hover:text-accent", "active:text-accent"]));
  });
});

describe("every public booking link keeps its job, without a line", () => {
  it("the profile's contact: the phone and the e-mail are still links — the chips above them keep their own outline", () => {
    const profile: PublicProfile = { slug: "chez-amelie", name: "Chez Amélie", timeZone: "Europe/Paris", bookingEnabled: true, phone: "06 00 00 00 00", email: "salon@example.test" };
    const markup = renderToStaticMarkup(<PublicProfileView profile={profile} location={address} />);
    const anchors = [...markup.matchAll(/<a href="(tel:[^"]+|mailto:[^"]+)"[^>]*>/g)];
    const quiet = anchors.filter(([tag]) => classOf(tag).startsWith("font-medium text-lavender-700"));
    expect(quiet.map(([, href]) => href)).toEqual(["tel:0600000000", "mailto:salon@example.test"]);
    for (const [tag] of quiet) {
      expect(lines(classOf(tag))).toEqual([]);
      expect(classOf(tag)).toContain("hover:text-accent");
    }
    // « Appeler » / « Écrire »: chips, their border kept.
    const chips = anchors.filter(([tag]) => classOf(tag).includes("rounded-full"));
    expect(chips).toHaveLength(2);
    for (const [tag] of chips) expect(classOf(tag).split(" ")).toEqual(expect.arrayContaining(["border", "border-lavender-200"]));
  });

  it("the booking's contact links (a notice, an empty list): tel: and mailto:, no line", () => {
    const markup = renderToStaticMarkup(<ContactLinks professional={professional} />);
    const anchors = [...markup.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)];
    expect(anchors.map(([, href]) => href)).toEqual(["tel:0478000000", "mailto:bonjour@studio.example"]);
    for (const [tag] of anchors) expect(lines(classOf(tag))).toEqual([]);
  });

  it("« Voir le détail »: still a button opening the dialog, its chevron and its focus ring kept — no line", () => {
    const markup = renderToStaticMarkup(
      <ServiceCardView service={coupe} selected={false} headingLevel={3} onChoose={noop} truncated onOpenDetail={noop} />,
    );
    const button = /<button type="button" aria-haspopup="dialog" aria-expanded="false"[^>]*>/.exec(markup)?.[0] ?? "";
    expect(button).not.toBe("");
    expect(lines(classOf(button))).toEqual([]);
    expect(classOf(button).split(" ")).toEqual(expect.arrayContaining(["text-lavender-700", "focus-visible:outline-2", "focus-visible:outline-offset-2", "hover:text-accent"]));
    expect(markup.slice(markup.indexOf(button))).toMatch(/^<button[^>]*>Voir le détail<span class="sr-only"> de Coupe<\/span><svg/);
  });

  it("the booking header's way back to her page: still a link to it, its arrow kept — no line, a 44 × 44 target (Step 197)", () => {
    const source = readFileSync(path.join(__dirname, "../booking-flow.tsx"), "utf8").replace(/\/\/.*$/gm, "");
    const back = /<a\s+href=\{profileHref\}\s+className=\{cn\(\s*"([^"]+)",\s*LINK_FEEDBACK,?\s*\)\}\s*>\s*<ArrowLeftIcon/.exec(source);
    expect(back).not.toBeNull();
    const classes = back![1].split(" ");
    expect(lines(back![1])).toEqual([]);
    expect(classes).toEqual(expect.arrayContaining(["text-lavender-700", "font-semibold"]));
    // 44 × 44 at least, drawn where the 32 px link was: the negative margins give the room back.
    expect(classes).toEqual(expect.arrayContaining(["min-h-11", "min-w-11", "-my-1.5", "-ml-2", "px-2", "rounded-sm"]));
    expect(classes).not.toContain("min-h-8");
    expect(back![1]).not.toMatch(/outline-none|outline-0/);
  });

  it("« Modifier la sélection » and the review's « Modifier »: buttons styled as quiet links, no line — disabled still dimmed", () => {
    const dateStep = renderToStaticMarkup(
      <SlotStep
        services={[coupe]}
        selectionMode
        window={{ firstDate: "2026-11-16", lastDate: "2026-11-18" }}
        date="2026-11-16"
        slots={{ status: "ready", slots: [slot] }}
        timeZone="Europe/Paris"
        professional={professional}
        onChangeService={noop}
        onChooseDate={noop}
        onChooseSlot={noop}
        onRetry={noop}
        onBack={noop}
        onContinue={noop}
      />,
    );
    const modify = /<button type="button" class="([^"]*)">Modifier la sélection<\/button>/.exec(dateStep);
    expect(modify).not.toBeNull();
    expect(lines(modify![1])).toEqual([]);
    const review = renderToStaticMarkup(
      <ReviewStep
        services={[coupe]}
        date="2026-11-16"
        slot={slot}
        timeZone="Europe/Paris"
        details={{ firstName: "Marie", lastName: "Dupont", email: "marie@example.test", phone: "06 12 34 56 78" }}
        professional={professional}
        sending={false}
        retrying={false}
        locked={false}
        challenge={{ status: "ready", token: "0.token" }}
        onEdit={noop}
        onBack={noop}
        onConfirm={noop}
        onRetryChallenge={noop}
      />,
    );
    const edits = [...review.matchAll(/<button[^>]*>Modifier<\/button>/g)].map(([tag]) => classOf(tag));
    expect(edits).toHaveLength(3);
    for (const classes of edits) {
      expect(lines(classes)).toEqual([]);
      expect(classes).toContain("disabled:opacity-40");
    }
  });

  it("« Itinéraire » inside a summary: still the platform's direct link in a new tab — no line", () => {
    const markup = renderToStaticMarkup(<LocationLines location={address} />);
    const link = /<a [^>]*>/.exec(markup)?.[0] ?? "";
    expect(link).toContain(`href="${GOOGLE_URL.replace(/&/g, "&amp;")}"`);
    expect(link).toContain('target="_blank" rel="noopener noreferrer"');
    expect(lines(classOf(link))).toEqual([]);
    expect(text(markup)).toContain("Itinéraire");
  });
});

describe("nothing else changes", () => {
  it("the keyboard focus keeps the site's ring (globals.css) — and no link style removes an outline", () => {
    const globals = readFileSync(path.join(__dirname, "../../../app/globals.css"), "utf8");
    expect(globals).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--color-accent\);\s*outline-offset: 2px;\s*\}/);
  });

  it("borders, separators and fields stay: the « Itinéraire » chip, the summary's lines, the inputs", () => {
    const chip = /<a [^>]*>/.exec(renderToStaticMarkup(<DirectionsActions directions={address.directions!} spoken={address.spoken} />))?.[0] ?? "";
    expect(classOf(chip).split(" ")).toEqual(expect.arrayContaining(["border", "border-lavender-200", "rounded-full"]));
    const summary = renderToStaticMarkup(<AppointmentSummary services={[coupe]} professional={professional} date="2026-11-16" slot={slot} timeZone="Europe/Paris" />);
    expect(summary.match(/border-t border-border\/70/g)?.length).toBeGreaterThanOrEqual(3);
    const form = renderToStaticMarkup(
      <DetailsStep details={{ firstName: "", lastName: "", email: "", phone: "" }} issues={{}} professional={professional} onEdit={noop} onBack={noop} onContinue={noop} />,
    );
    const inputs = [...form.matchAll(/<input [^>]*>/g)].map(([tag]) => classOf(tag));
    expect(inputs).toHaveLength(4);
    for (const classes of inputs) expect(classes.split(" ")).toEqual(expect.arrayContaining(["border", "border-border", "focus-visible:border-accent"]));
  });
});

describe("no line comes back — every public booking source", () => {
  /** The public booking pages: their components, their routes, their footer. */
  function sources(): string[] {
    const roots = [path.join(__dirname, ".."), path.join(__dirname, "../../../app/r")];
    const files: string[] = [path.join(__dirname, "../../layout/public-footer.tsx")];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "__tests__") walk(full);
        } else if (/\.(tsx|ts)$/.test(name)) files.push(full);
      }
    };
    for (const root of roots) walk(root);
    return files;
  }

  it("no underline, no decoration — in a default, hover, active, visited or focus state", () => {
    const offending: string[] = [];
    for (const file of sources()) {
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      for (const literal of code.match(/"[^"\n]*"|`[^`]*`/g) ?? []) {
        for (const name of literal.slice(1, -1).split(/\s+/)) {
          if (/^(?:[\w-]+:)*(underline|no-underline|underline-offset-.+|decoration-.+)$/.test(name)) offending.push(`${path.basename(file)}: ${name}`);
        }
      }
    }
    expect(offending).toEqual([]);
    expect(sources().length).toBeGreaterThan(10);
  });
});
