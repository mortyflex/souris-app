import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function header(variant: "profile" | "flow", contactEmail?: string) {
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", contactEmail ?? "");
  vi.resetModules();
  const { SiteHeader } = await import("../site-header");
  return renderToStaticMarkup(<SiteHeader variant={variant} />);
}

describe("SiteHeader", () => {
  it("draws the wordmark at 44 px, 58 px from 1024 px, keeping its proportions", async () => {
    const html = await header("profile");
    expect(html).toContain('alt="BeautIzzy"');
    expect(html).toMatch(/class="h-11 w-auto lg:h-\[58px\]"/);
    expect(html).toContain('width="1489" height="541"');
  });

  it("profile: only a quiet link for professionals", async () => {
    const html = await header("profile", "bonjour@example.test");
    expect(html).toContain("Pour les professionnels");
    expect(html).not.toContain("Navigation principale");
    expect(html).not.toContain("mailto:");
  });

  it("booking flow: the wordmark alone — no link, no navigation, no call to action", async () => {
    const html = await header("flow", "bonjour@example.test");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("<nav");
    expect(html).toContain('alt="BeautIzzy"');
  });
});
