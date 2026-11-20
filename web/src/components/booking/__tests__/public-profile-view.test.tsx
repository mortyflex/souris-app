import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LocationView } from "@/features/location/location-view";
import type { PublicProfile } from "@/features/public-profile/public-profile";

import { BookingInactiveNotice } from "../booking-inactive-notice";
import { PublicProfileView } from "../public-profile-view";

const minimal: PublicProfile = {
  slug: "chez-amelie",
  name: "Chez Amélie",
  timeZone: "Europe/Paris",
  bookingEnabled: false,
};

const complete: PublicProfile = {
  ...minimal,
  description: "Coiffure sur rendez-vous.\nDu mardi au samedi.",
  phone: "06 00 00 00 00",
  email: "salon@example.test",
  bookingEnabled: true,
};

const DESTINATION = "1%20rue%20de%20la%20Paix%2C%2075002%20Paris";
const APPLE_URL = `https://maps.apple.com/directions?destination=${DESTINATION}`;
const GOOGLE_URL = `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}`;
/** What the server made of a published complete address, for a visitor on an iPhone. */
const address: LocationView = {
  kind: "address",
  lines: ["1 rue de la Paix", "75002 Paris"],
  spoken: "1 rue de la Paix, 75002 Paris",
  directions: {
    primary: { provider: "apple", providerName: "Plans", url: APPLE_URL },
    alternative: { provider: "google", providerName: "Google Maps", url: GOOGLE_URL },
  },
};
const city: LocationView = { kind: "city", city: "Paris" };
/** How many times a text appears in a page. */
const count = (html: string, text: string) => html.split(text).length - 1;

const render = (props: Parameters<typeof PublicProfileView>[0]) => renderToStaticMarkup(<PublicProfileView {...props} />);

describe("PublicProfileView", () => {
  it("shows a published profile: name, description, contact, images", () => {
    const html = render({ profile: complete, location: address, logoUrl: "https://media.test/logo.jpg", coverUrl: "https://media.test/cover.jpg" });

    expect(html).toContain("<h1");
    expect(html).toContain("Chez Amélie");
    expect(html).toContain("Coiffure sur rendez-vous.\nDu mardi au samedi.");
    expect(html).toContain('href="tel:0600000000"');
    expect(html).toContain('href="mailto:salon@example.test"');
    expect(html).toContain("1 rue de la Paix");
    expect(html).toContain("75002 Paris");
    expect(html).toContain('src="https://media.test/logo.jpg"');
    expect(html).toContain('src="https://media.test/cover.jpg"');
  });

  it("says booking is coming when bookings are enabled, and offers no way to book", () => {
    const html = render({ profile: complete });
    expect(html).toContain("La réservation en ligne arrive bientôt.");
    expect(html).not.toContain("en pause");
    expect(html).not.toContain("/reserver");
    expect(html).not.toMatch(/<form|<button|<input/);
  });

  it("says bookings are paused", () => {
    const html = render({ profile: { ...complete, bookingEnabled: false } });
    expect(html).toContain("Les réservations en ligne sont en pause.");
    expect(html).not.toContain("arrive bientôt");
    expect(html).not.toContain("/reserver");
  });

  it("handles missing images: no <img>, the initial stands for the logo", () => {
    const html = render({ profile: { ...minimal, name: "élégance" } });
    expect(html).not.toContain("<img");
    expect(html).toContain(">É</span>");
  });

  it("shows a logo whole and a cover cropped from its centre, whatever their proportions", () => {
    const html = render({ profile: minimal, logoUrl: "https://media.test/logo.jpg", coverUrl: "https://media.test/cover.jpg" });
    expect(html).toMatch(/<img src="https:\/\/media\.test\/logo\.jpg"[^>]*object-contain/);
    expect(html).toMatch(/<img src="https:\/\/media\.test\/cover\.jpg"[^>]*object-cover object-center/);
  });

  it("keeps one identity panel, with the name in it, with or without a cover", () => {
    for (const coverUrl of ["https://media.test/cover.jpg", undefined]) {
      const html = render({ profile: complete, coverUrl });
      const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
      expect(header).toContain("<h1");
      expect(header).toContain("Coiffure sur rendez-vous.");
      expect(header.match(/<h1/g)).toHaveLength(1);
    }
  });

  it("handles missing optional contact information: no empty section, no dangling invitation", () => {
    const html = render({ profile: minimal });
    expect(html).not.toContain("Contact");
    expect(html).not.toContain("Téléphone");
    expect(html).not.toContain("contacter");
    expect(html).not.toContain("whitespace-pre-line");
  });

  it("shows only the contact details that exist", () => {
    const html = render({ profile: { ...minimal, phone: "+33 6 00 00 00 00" } });
    expect(html).toContain('href="tel:+33600000000"');
    expect(html).not.toContain("E-mail");
    expect(html).not.toContain("Adresse");
    expect(html).not.toContain("data-location");
  });

  it("lets a long business name wrap instead of overflowing, at a smaller display size", () => {
    const name = `Institut ${"Trèslongnomsansaucuneespace".repeat(4)} & Spa`;
    const html = render({ profile: { ...minimal, name } });
    expect(html).toContain(name.replace("&", "&amp;"));
    // The name role breaks an unbreakable word (overflow-wrap: anywhere — see the
    // stylesheet test below); min-w-0 lets the heading shrink beside the logo.
    expect(html).toMatch(/<h1 class="type-name-long [^"]*min-w-0/);
    expect(render({ profile: minimal })).toMatch(/<h1 class="type-name [^"]*min-w-0/);
  });

  it("gives every name role a wrap that cannot overflow", () => {
    const css = readFileSync(path.join(__dirname, "../../../styles/typography.css"), "utf8");
    for (const role of ["type-name", "type-name-medium", "type-name-long"]) {
      const block = css.match(new RegExp(`@utility ${role} \\{([^}]*)\\}`))?.[1];
      expect(block, role).toContain("overflow-wrap: anywhere;");
    }
  });

  it("escapes what the professional typed", () => {
    const html = render({ profile: { ...minimal, name: "<script>alert(1)</script>", description: "<img src=x onerror=alert(1)>" } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
  });

  it("invents nothing: no service, price, slot, review or statistic", () => {
    const html = render({ profile: complete });
    expect(html).not.toMatch(/€|prestation|créneau|avis|étoile|\d+\s*clients/i);
  });
});

describe("PublicProfileView — the Nacre design", () => {
  it("without a photo: the animated Nacre artwork, decorative, light and self-contained", () => {
    const html = render({ profile: complete });
    expect(html).toMatch(/<div aria-hidden="true" data-animated="true" class="nacre/);
    expect(html).not.toMatch(/<filter|<image|<text|feGaussianBlur|url\(http/);
    expect(html).not.toContain("<img");
  });

  it("a published photo always wins: Nacre stays underneath, at rest", () => {
    const html = render({ profile: complete, coverUrl: "https://media.test/cover.jpg" });
    expect(html).toMatch(/data-animated="false" class="nacre/);
    expect(html.indexOf("nacre")).toBeLessThan(html.indexOf('src="https://media.test/cover.jpg"'));
  });

  it("no published location — hidden, or never chosen: no place, no map, no directions, no coordinates, nothing to open", () => {
    for (const profile of [minimal, complete, { ...minimal, phone: "06 00 00 00 00", email: "a@example.test" }]) {
      const html = render({ profile });
      expect(html).not.toMatch(/<iframe|maps\.|google|apple\.com|apple-mapkit|geo:|Itinéraire|latitude|longitude|Adresse|Lieu|data-location/i);
      expect(html).not.toContain("profile-place-lilac");
    }
  });

  it("a published address: its two lines, « Itinéraire », the other application, and ONE map vignette that opens the same directions", () => {
    const html = render({ profile: complete, location: address });

    expect(html).toContain('data-location="address"');
    expect(html).toMatch(/<dt[^>]*>Adresse<\/dt>/);
    expect(html).toContain('<span class="block">1 rue de la Paix</span><span class="block">75002 Paris</span>');
    // « Itinéraire » — the visitor's probable application — and the map both open it; the alternative is beside.
    expect(count(html, `href="${APPLE_URL}"`)).toBe(2);
    expect(count(html, `href="${GOOGLE_URL.replace("&", "&amp;")}"`)).toBe(1);
    expect(html).toContain("Itinéraire</a>");
    expect(html).toContain("Ouvrir dans Google Maps</a>");
    // One vignette (its Nacre ids stay unique on the page): under the address on a phone, beside it from 640 px.
    expect(count(html, 'id="profile-place-lilac"')).toBe(1);
    expect(html).toContain('<dd class="col-span-2 sm:col-span-1">');
    // Text first, then the actions, then the vignette, in reading order.
    expect(html.indexOf("1 rue de la Paix")).toBeLessThan(html.indexOf("Itinéraire</a>"));
    expect(html.indexOf("Itinéraire</a>")).toBeLessThan(html.indexOf("profile-place-lilac"));
  });

  it("a published city: the city alone — a quiet picture, no marker, no link, no directions", () => {
    const html = render({ profile: complete, location: city });

    expect(html).toContain('data-location="city"');
    expect(html).toMatch(/<dt[^>]*>Lieu<\/dt>/);
    expect(html).toMatch(/<dd[^>]*>Paris<\/dd>/);
    expect(html).not.toMatch(/Itinéraire|maps\.apple|google\.com\/maps|Ouvrir dans|rue de la Paix|75002|data-directions/);
    expect(count(html, 'id="profile-place-lilac"')).toBe(1);
    expect(html).toMatch(/data-map-kind="city"[^>]*><div aria-hidden="true"/);
  });

  it("a city is a place, not a way to reach her: alone, it never promises a contact", () => {
    const paused = { ...minimal, bookingEnabled: false };
    expect(render({ profile: paused, location: city })).not.toContain("contacter");
    expect(render({ profile: paused, location: address })).toContain("Vous pouvez contacter Chez Amélie directement.");
    // The section is still there for the city.
    expect(render({ profile: paused, location: city })).toContain('<h2 id="contact"');
  });

  it("offers a contact action only for what is published", () => {
    expect(render({ profile: { ...minimal, phone: "06 00 00 00 00" } })).toContain(">Appeler</a>");
    expect(render({ profile: { ...minimal, phone: "06 00 00 00 00" } })).not.toContain(">Écrire</a>");
    expect(render({ profile: { ...minimal, email: "a@example.test" } })).toContain(">Écrire</a>");
    expect(render({ profile: minimal })).not.toMatch(/Appeler|Écrire|role="group"/);
  });

  it("invites to book with a sticky action only where booking is open", () => {
    const open = render({ profile: complete, bookingOpen: true });
    expect(open).toContain("data-sticky-cta");
    expect(open).toContain('href="/r/chez-amelie/reserver"');
    expect(open).toContain("Horaires à l’heure de Paris");
    for (const props of [{ profile: complete }, { profile: { ...complete, bookingEnabled: false }, bookingOpen: true }]) {
      const html = render(props);
      expect(html).not.toContain("data-sticky-cta");
      expect(html).not.toContain("/reserver");
    }
  });

  it("never assumes the professional's gender", () => {
    const html = render({ profile: { ...complete, bookingEnabled: false } });
    expect(html).not.toMatch(/professionnelle|la contacter|le contacter/);
    expect(html).toContain("Vous pouvez contacter Chez Amélie directement.");
  });
});

describe("BookingInactiveNotice", () => {
  it("says booking is not open and links back to the professional's page only", () => {
    const html = renderToStaticMarkup(<BookingInactiveNotice profile={minimal} />);
    expect(html).toContain("n&#x27;est pas encore ouverte");
    expect(html).toContain('href="/r/chez-amelie"');
    expect(html).not.toMatch(/<form|<input|<select/);
  });
});
