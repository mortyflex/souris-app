import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
  address: "1 rue de la Paix, 75002 Paris",
  bookingEnabled: true,
};

const render = (props: Parameters<typeof PublicProfileView>[0]) => renderToStaticMarkup(<PublicProfileView {...props} />);

describe("PublicProfileView", () => {
  it("shows a published profile: name, description, contact, images", () => {
    const html = render({ profile: complete, logoUrl: "https://media.test/logo.jpg", coverUrl: "https://media.test/cover.jpg" });

    expect(html).toContain("<h1");
    expect(html).toContain("Chez Amélie");
    expect(html).toContain("Coiffure sur rendez-vous.\nDu mardi au samedi.");
    expect(html).toContain('href="tel:0600000000"');
    expect(html).toContain('href="mailto:salon@example.test"');
    expect(html).toContain("1 rue de la Paix, 75002 Paris");
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

  it("shows no map, no coordinates and no directions until an explicit address privacy setting exists", () => {
    const html = render({ profile: complete });
    expect(html).not.toMatch(/<iframe|maps\.|google|apple\.com|geo:|Itinéraire|latitude|longitude/i);
    expect(html).toContain("1 rue de la Paix, 75002 Paris");
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
