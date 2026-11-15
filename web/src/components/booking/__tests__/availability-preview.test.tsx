import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicProfile } from "@/features/public-profile/public-profile";

const profile: PublicProfile = { slug: "chez-amelie", name: "Chez Amélie", timeZone: "Europe/Paris", bookingEnabled: true };

const base = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [
    { id: "tech-couleur", name: "Couleur", duration_minutes: 90 },
    { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
  ],
};
const coupe = { id: "svc-coupe", name: "Coupe", duration_minutes: 45 };
const slots = [
  { starts_at: "2026-11-20T08:00:00Z", ends_at: "2026-11-20T08:45:00Z", local_time: "09:00" },
  { starts_at: "2026-11-20T08:15:00Z", ends_at: "2026-11-20T09:00:00Z", local_time: "09:15" },
  { starts_at: "2026-11-20T13:00:00Z", ends_at: "2026-11-20T13:45:00Z", local_time: "14:00" },
];

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function render(query: { serviceId?: string; date?: string }) {
  vi.resetModules();
  const { AvailabilityPreview } = await import("../availability-preview");
  return renderToStaticMarkup(await AvailabilityPreview({ profile, query }));
}

const bodies = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map((call) => JSON.parse(((call as unknown[])[1] as RequestInit).body as string));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_value");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AvailabilityPreview", () => {
  it("presents the service, the local date and its start times — read-only, labelled as a preview", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...base, status: "SLOTS", service: coupe, date: "2026-11-20", slots })));
    const html = await render({ serviceId: "svc-coupe", date: "2026-11-20" });

    expect(html).toContain("Aperçu");
    expect(html).toContain("ne peuvent pas être réservés");
    expect(html).toContain("Horaires du vendredi 20 novembre");
    for (const time of ["09:00", "09:15", "14:00"]) expect(html).toContain(`>${time}</time>`);
    expect(html).toContain('dateTime="2026-11-20T08:00:00Z"');
    expect(html).toContain("à l’heure de Paris");
    expect(html).toMatch(/un horaire affiché n(&#x27;|')est jamais réservé/);
    // The selected service and date are marked; nothing can be submitted.
    expect(html).toMatch(/aria-current="true"[^>]*href="\/r\/chez-amelie\/reserver\?service=svc-coupe&amp;date=2026-11-20"/);
    expect(html).toContain('aria-current="date"');
    expect(html).toContain("1 h 30");
    expect(html).not.toMatch(/<form|<input|<button|Réserver ce créneau|Confirmer/);
  });

  it("lists every date of the window as a link, keeping the service", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...base, status: "SLOTS", service: coupe, date: "2026-11-20", slots })));
    const html = await render({ serviceId: "svc-coupe", date: "2026-11-20" });
    expect(html.match(/href="\/r\/chez-amelie\/reserver\?service=svc-coupe&amp;date=2026-1[12]-\d\d"/g)).toHaveLength(31);
    expect(html).toContain('aria-label="lundi 16 novembre"');
    expect(html).toContain('aria-label="mardi 15 décembre"');
  });

  it("says so when a day has no start time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...base, status: "SLOTS", service: coupe, date: "2026-11-17", slots: [] })));
    const html = await render({ serviceId: "svc-coupe", date: "2026-11-17" });
    expect(html).toContain("Aucun horaire disponible ce jour-là.");
    expect(html).toContain("Essayez une autre date.");
    expect(html).not.toContain("<time");
  });

  it("asks for a service first", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...base, status: "CHOOSE_SERVICE" })));
    const html = await render({});
    expect(html).toContain("Prestation");
    expect(html).toContain('href="/r/chez-amelie/reserver?service=tech-couleur"');
    expect(html).not.toContain("Horaires du");
  });

  it("opens the first bookable date when a service is chosen without a date", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...base, status: "CHOOSE_DATE", service: coupe }))
      .mockResolvedValueOnce(respond({ ...base, status: "SLOTS", service: coupe, date: "2026-11-16", slots }));
    vi.stubGlobal("fetch", fetchMock);
    const html = await render({ serviceId: "svc-coupe" });
    expect(bodies(fetchMock)).toEqual([
      { p_slug: "chez-amelie", p_service_id: "svc-coupe", p_date: null },
      { p_slug: "chez-amelie", p_service_id: "svc-coupe", p_date: "2026-11-16" },
    ]);
    expect(html).toContain("Horaires du lundi 16 novembre");
  });

  it("explains an unknown service and a date outside the window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...base, status: "UNKNOWN_SERVICE" })));
    expect(await render({ serviceId: "svc-private" })).toContain("Cette prestation n’est pas proposée en ligne.");

    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...base, status: "OUT_OF_WINDOW", service: coupe, date: "2027-03-01" })));
    const html = await render({ serviceId: "svc-coupe", date: "2027-03-01" });
    expect(html).toContain("Cette date n’est pas ouverte.");
    expect(html).toContain("entre le lundi 16 novembre et le mardi 15 décembre");
  });

  it("has an empty state when no service is bookable online", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...base, services: [], status: "CHOOSE_SERVICE" })));
    expect(await render({})).toContain("Aucune prestation n’est encore proposée en ligne.");
  });

  it("shows the inactive notice when the page does not accept bookings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(null)));
    const html = await render({ serviceId: "svc-coupe", date: "2026-11-20" });
    expect(html).toContain("Pas encore disponible");
    expect(html).not.toContain("Aperçu");
  });

  it("shows an error state with a retry, never « no slot », when the lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 503)));
    const html = await render({ serviceId: "svc-coupe", date: "2026-11-20" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Les disponibilités n’ont pas pu être chargées.");
    expect(html).toContain('href="/r/chez-amelie/reserver?service=svc-coupe&amp;date=2026-11-20"');
    expect(html).not.toContain("Aucun horaire");
  });
});

describe("AvailabilityLoading", () => {
  it("is announced as loading", async () => {
    const { AvailabilityLoading } = await import("../availability-preview");
    const html = renderToStaticMarkup(<AvailabilityLoading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement des disponibilités…");
  });
});
