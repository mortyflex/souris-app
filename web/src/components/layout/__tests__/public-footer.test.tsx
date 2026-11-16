import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function footer(variant: "profile" | "flow", contactEmail = "") {
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", contactEmail);
  vi.resetModules();
  const { PublicFooter } = await import("../public-footer");
  return renderToStaticMarkup(<PublicFooter variant={variant} />);
}

const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map(([, href]) => href);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("PublicFooter", () => {
  it("the wordmark carries it — 36 px, twice the old line — and the words stay quiet", async () => {
    const html = await footer("profile");
    expect(html).toContain('alt="BeautIzzy"');
    expect(html.match(/<img alt="BeautIzzy"[^>]*class="([^"]*)"/)?.[1]?.split(" ")).toContain("h-9");
    expect(html).toMatch(/<span class="type-meta text-foreground\/55">Réservation en ligne avec<\/span>/);
    expect(text(html)).toContain(`© ${new Date().getFullYear()} BeautIzzy`);
  });

  it("profile: « Pour les professionnels » and, with a contact address, « Contacter BeautIzzy »", async () => {
    const html = await footer("profile", "bonjour@example.test");
    expect(hrefs(html)).toEqual(["/", "mailto:bonjour@example.test"]);
    expect(text(html)).toMatch(/Pour les professionnels .*Contacter BeautIzzy/);
  });

  it("booking flow: nothing pulls a customer out of a booking — no link to the website", async () => {
    expect(hrefs(await footer("flow", "bonjour@example.test"))).toEqual(["mailto:bonjour@example.test"]);
    const bare = await footer("flow");
    expect(hrefs(bare)).toEqual([]);
    expect(bare).not.toContain("<nav");
  });

  it("never a dead link: no contact without an address, no legal page that does not exist yet", async () => {
    for (const html of [await footer("profile"), await footer("flow"), await footer("profile", "bonjour@example.test")]) {
      // The only page these links may reach is the website's home: the legal pages are not written yet.
      for (const href of hrefs(html)) expect(href === "/" || href.startsWith("mailto:")).toBe(true);
      expect(text(html)).not.toMatch(/Mentions légales|confidentialité|CGU|Conditions/i);
    }
    expect(hrefs(await footer("profile"))).toEqual(["/"]);
  });
});
