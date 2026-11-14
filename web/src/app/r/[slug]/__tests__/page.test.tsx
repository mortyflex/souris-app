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
});

describe("/r/[slug]", () => {
  it("renders the published profile with its public image URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ slug: "chez-amelie", name: "Chez Amélie", logo_path: LOGO, booking_enabled: false })));
    const { profilePage } = await load();

    const html = renderToStaticMarkup(await profilePage.default(props("chez-amelie")));

    expect(html).toContain("Chez Amélie");
    expect(html).toContain(`https://ref.supabase.co/storage/v1/object/public/business-public-media/${LOGO}`);
    expect(html).not.toContain("sb_secret");
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
});
