import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOGO = "22222222-2222-4222-8222-222222222222/logo/33333333-3333-4333-8333-333333333333.jpg";

function respond(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

async function load() {
  vi.resetModules();
  const [profilePage, bookingPage] = await Promise.all([import("../page"), import("../reserver/page")]);
  return { profilePage, bookingPage };
}

const props = (slug: string) => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });

/** The first element of a tree that carries a Suspense `fallback`. */
function findSuspense(node: unknown): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSuspense(child);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return undefined;
  const element = node as ReactElement<{ fallback?: unknown; children?: unknown }>;
  if (element.props.fallback !== undefined) return element;
  return findSuspense(element.props.children);
}

/** What `notFound()` throws: Next.js turns it into an HTTP 404 when nothing has been sent yet. */
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
const digestOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => (error as { digest?: string }).digest,
  );

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_value");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/r/[slug]", () => {
  it("renders the published profile with its public image URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ slug: "chez-amelie", name: "Chez Amélie", logo_path: LOGO, booking_enabled: false })));
    const { profilePage } = await load();

    const html = renderToStaticMarkup(await profilePage.default(props("chez-amelie")));

    expect(html).toContain("Chez Amélie");
    expect(html).toContain(`https://ref.supabase.co/storage/v1/object/public/business-public-media/${LOGO}`);
    expect(html).not.toContain("sb_secret");
    // The public footer, with the website link the profile offers.
    expect(html).toMatch(/<footer[\s\S]*Réservation en ligne avec[\s\S]*href="\/"[^>]*>Pour les professionnels<\/a>[\s\S]*<\/footer>/);
    await expect(profilePage.generateMetadata(props("chez-amelie"))).resolves.toMatchObject({ title: "Chez Amélie" });
  });

  it("answers 404 for an unknown, draft or unpublished slug (the server answers null)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(null)));
    const { profilePage } = await load();
    await expect(digestOf(profilePage.default(props("nobody-here")))).resolves.toBe(NOT_FOUND);
    await expect(profilePage.generateMetadata(props("nobody-here"))).resolves.toEqual({ title: "Page introuvable" });
  });

  it("answers 404 for a malformed slug without any lookup", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { profilePage } = await load();
    await expect(digestOf(profilePage.default(props("Bad_Slug")))).resolves.toBe(NOT_FOUND);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not turn a failed lookup into a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { profilePage } = await load();
    await expect(digestOf(profilePage.default(props("chez-amelie")))).resolves.toBeUndefined();
    await expect(profilePage.default(props("chez-amelie"))).rejects.toThrow("HTTP 500");
  });
});

describe("/r/[slug]/reserver", () => {
  it("stays unavailable for an online profile: a notice, no booking form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ slug: "chez-amelie", name: "Chez Amélie", booking_enabled: true })));
    const { bookingPage } = await load();
    const html = renderToStaticMarkup(await bookingPage.default(props("chez-amelie")));
    expect(html).toContain("Pas encore disponible");
    expect(html).not.toMatch(/<form|<input/);
  });

  it("answers 404 when no page is online at that address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(null)));
    const { bookingPage } = await load();
    await expect(digestOf(bookingPage.default(props("nobody-here")))).resolves.toBe(NOT_FOUND);
    await expect(digestOf(bookingPage.default(props("Bad_Slug")))).resolves.toBe(NOT_FOUND);
  });

  it("without the preview switch, never asks for availability", async () => {
    const fetchMock = vi.fn(async () => respond({ slug: "chez-amelie", name: "Chez Amélie", booking_enabled: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { bookingPage } = await load();
    const html = renderToStaticMarkup(
      await bookingPage.default({ ...props("chez-amelie"), searchParams: Promise.resolve({ service: "svc-coupe" }) }),
    );
    expect(html).toContain("Pas encore disponible");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/online_booking_public_profile$/);
  });

  it("on the production website the switch is ignored", async () => {
    vi.stubEnv("ONLINE_BOOKING_AVAILABILITY_PREVIEW", "enabled");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://beautizzy.fr");
    vi.stubGlobal("fetch", vi.fn(async () => respond({ slug: "chez-amelie", name: "Chez Amélie", booking_enabled: true })));
    const { bookingPage } = await load();
    expect(renderToStaticMarkup(await bookingPage.default(props("chez-amelie")))).toContain("Pas encore disponible");
  });

  it("with the preview switch, streams the validated preview under its own Suspense — and still answers a real 404", async () => {
    vi.stubEnv("ONLINE_BOOKING_AVAILABILITY_PREVIEW", "enabled");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubGlobal("fetch", vi.fn(async () => respond({ slug: "chez-amelie", name: "Chez Amélie", booking_enabled: true })));
    const { bookingPage } = await load();
    const page = (await bookingPage.default({
      ...props("chez-amelie"),
      searchParams: Promise.resolve({ service: "svc-coupe", date: "2026-02-30" }),
    })) as ReactElement;
    // The page shell (header, main) wraps the content: find the preview's own Suspense boundary.
    const element = findSuspense(page) as ReactElement<{ fallback: ReactElement; children: ReactElement<{ query: unknown }> }>;
    // The malformed date is dropped before anything reaches the server.
    expect(element.props.children.props.query).toEqual({ serviceId: "svc-coupe" });
    expect(renderToStaticMarkup(element.props.fallback)).toContain("Chargement des disponibilités…");

    vi.stubGlobal("fetch", vi.fn(async () => respond(null)));
    const again = await load();
    await expect(digestOf(again.bookingPage.default(props("nobody-here")))).resolves.toBe(NOT_FOUND);
  });
});

describe("the booking flow (development / Staging gate)", () => {
  const online = { slug: "chez-amelie", name: "Chez Amélie", booking_enabled: true, address: "3 place Bellecour" };
  const choose = {
    time_zone: "Europe/Paris",
    slot_minutes: 15,
    first_date: "2026-11-16",
    last_date: "2026-12-15",
    services: [
      { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
      { id: "tech-couleur", name: "Couleur", duration_minutes: 90 },
    ],
    status: "CHOOSE_SERVICE",
  };
  /** The profile, then the availability, from the ONE function each. */
  const answering = (profile: unknown, availability: unknown) =>
    vi.fn(async (url: string) => respond(String(url).endsWith("online_booking_public_profile") ? profile : availability));

  beforeEach(() => {
    vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "enabled");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("TURNSTILE_SITE_KEY", "0x4AAAAAAAsiteKeyOfTheTests");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAAsecretKeyOfTheTests00000");
  });

  it("the profile invites to book", async () => {
    vi.stubGlobal("fetch", answering(online, choose));
    const { profilePage } = await load();
    const html = renderToStaticMarkup(await profilePage.default(props("chez-amelie")));
    expect(html).toContain("Prendre rendez-vous");
    expect(html).toContain('href="/r/chez-amelie/reserver"');
    expect(html).not.toContain("arrive bientôt");
  });

  it("the booking route renders the flow with the server's services — no price, no secret", async () => {
    const fetchMock = answering(online, choose);
    vi.stubGlobal("fetch", fetchMock);
    const { bookingPage } = await load();
    const html = renderToStaticMarkup(await bookingPage.default(props("chez-amelie")));
    expect(html).toContain("Choisissez une prestation");
    expect(html).toContain("Coupe");
    expect(html).toContain("1 h 30");
    expect(html).toContain("Étape 1 sur 4");
    expect(html).not.toMatch(/€|sb_secret/);
    expect(html).not.toContain("0x4AAAAAAAsecretKeyOfTheTests00000");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The public footer closes the flow too, without a link out of the booking.
    expect(html).toMatch(/<footer[\s\S]*Réservation en ligne avec[\s\S]*<\/footer>/);
    expect(html).not.toContain('href="/"');
  });

  it.each<[string, Record<string, string>]>([
    ["no Turnstile site key", { TURNSTILE_SITE_KEY: "" }],
    ["no Turnstile secret", { TURNSTILE_SECRET_KEY: "" }],
    ["Cloudflare's test keys on a hosted site", {
      NEXT_PUBLIC_SITE_URL: "https://staging.beautizzy.example",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    }],
  ])("without a usable security check (%s) the flow is not offered, and no availability is read", async (_label, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const fetchMock = answering(online, choose);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { bookingPage } = await load();
    const html = renderToStaticMarkup(await bookingPage.default(props("chez-amelie")));
    expect(html).toContain("pas disponible pour le moment");
    expect(html).not.toContain("Choisissez une prestation");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a paused page says so, without asking for availability", async () => {
    const fetchMock = answering({ ...online, booking_enabled: false }, choose);
    vi.stubGlobal("fetch", fetchMock);
    const { bookingPage } = await load();
    const html = renderToStaticMarkup(await bookingPage.default(props("chez-amelie")));
    expect(html).toContain("Les réservations en ligne sont en pause.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a page whose availability answers nothing says booking is unavailable", async () => {
    vi.stubGlobal("fetch", answering(online, null));
    const { bookingPage } = await load();
    expect(renderToStaticMarkup(await bookingPage.default(props("chez-amelie")))).toContain("pas disponible pour le moment");
  });

  it("a failed availability read is an error with a retry, never an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).endsWith("online_booking_public_profile") ? respond(online) : new Response("{}", { status: 500 }))),
    );
    const { bookingPage } = await load();
    const html = renderToStaticMarkup(await bookingPage.default(props("chez-amelie")));
    expect(html).toContain("Les prestations n’ont pas pu être chargées.");
    expect(html).not.toContain("Aucune prestation");
  });

  it("is never offered on the production website", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://beautizzy.fr");
    vi.stubGlobal("fetch", answering(online, choose));
    const { profilePage, bookingPage } = await load();
    expect(renderToStaticMarkup(await profilePage.default(props("chez-amelie")))).toContain("arrive bientôt");
    expect(renderToStaticMarkup(await bookingPage.default(props("chez-amelie")))).toContain("Pas encore disponible");
  });
});
