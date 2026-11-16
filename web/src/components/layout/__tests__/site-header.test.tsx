import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function header(variant: "marketing" | "profile" | "flow", contactEmail?: string) {
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

  it("marketing: the landing's sections and a contact call to action with a real destination", async () => {
    const html = await header("marketing", "bonjour@example.test");
    expect(html).toContain('aria-label="Navigation principale"');
    for (const anchor of ["/#fonctionnalites", "/#reservation-en-ligne", "/#tarif", "/#questions"]) expect(html).toContain(`href="${anchor}"`);
    expect(html).toContain("mailto:bonjour@example.test?subject=");
    expect(html).toContain("Demander un accès");
  });

  it("marketing: no call to action at all without a configured contact address (never a dead link)", async () => {
    const html = await header("marketing");
    expect(html).not.toContain("Demander un accès");
    expect(html).not.toContain("mailto:");
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

describe("SiteHeader — marketing layout", () => {
  it("desktop: three zones (brand · centred navigation · one action) in one grid", async () => {
    const html = await header("marketing", "bonjour@example.test");
    expect(html).toMatch(/lg:grid lg:h-20 lg:grid-cols-\[1fr_auto_1fr\]/);
    const navs = html.match(/<nav aria-label="Navigation principale"/g) ?? [];
    expect(navs).toHaveLength(2); // desktop (hidden below 1024 px) and the mobile menu (hidden from 1024 px)
    expect(html).toContain('class="hidden lg:block"');
  });

  it("mobile: a menu button that names itself, exposes its state and controls its panel", async () => {
    const html = await header("marketing");
    const button = html.match(/<button[^>]*aria-expanded="false"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    const controls = button.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain(`id="${controls}" data-open="false"`);
    expect(button).toContain('<span class="sr-only">Menu</span>');
  });

  it("sticky, with its scroll state set by script only (no layout change)", async () => {
    const html = await header("marketing");
    expect(html).toMatch(/<header class="site-header sticky top-0 z-40">/);
    expect(html).not.toContain("data-scrolled");
  });
});
