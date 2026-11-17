import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname, "../..");
const css = readFileSync(path.join(__dirname, "../typography.css"), "utf8");
const layout = readFileSync(path.join(SRC, "app/layout.tsx"), "utf8");

const LARGE_DISPLAY_ROLES = ["type-display", "type-name", "type-name-medium", "type-name-long", "type-headline"];

const block = (role: string) => css.match(new RegExp(`@utility ${role} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";

/** Every source file under a folder (.ts, .tsx, .css), tests excluded. */
function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(full);
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
  });
}

describe("brand typography: Fraunces + Manrope (docs/design/BRAND_TYPOGRAPHY.md)", () => {
  it("loads Fraunces on its weight axis only — no optical-size, SOFT or WONK axis is downloaded", () => {
    expect(layout).toMatch(/import \{ Fraunces, Manrope \} from "next\/font\/google";/);
    const calls = [...layout.matchAll(/Fraunces\(\{([\s\S]*?)\}\)/g)].map(([, options]) => options);
    expect(calls).toHaveLength(2);
    for (const options of calls) {
      expect(options).toContain('subsets: ["latin"]');
      expect(options).not.toMatch(/\baxes\b|\bweight\b/);
    }
    // The italic is declared, never preloaded.
    const italic = calls.find((options) => options.includes('style: "italic"'));
    expect(italic).toContain("preload: false");
  });

  it("the display families are Fraunces, then local serif fallbacks", () => {
    expect(css).toContain("--bz-font-display: var(--font-fraunces), ui-serif, Georgia, serif;");
    expect(css).toContain("--bz-font-display-italic: var(--font-fraunces-italic), ui-serif, Georgia, serif;");
  });

  it("every heading draws the file's own cut: no optical-size or variation tuning anywhere", () => {
    expect(css).not.toMatch(/opsz|font-variation-settings:|font-optical-sizing|dppx/);
  });

  it("large display roles are 400, titles 500 — never lighter, never heavier", () => {
    for (const role of LARGE_DISPLAY_ROLES) {
      expect(block(role), role).toContain("font-family: var(--bz-font-display);");
      expect(block(role), role).toContain("font-weight: var(--bz-weight-regular);");
    }
    expect(block("type-title")).toContain("font-weight: var(--bz-weight-medium);");
  });

  it("a bare `font-display` composition stays within the display weights (400 or 500)", () => {
    const offenders = [...sources(path.join(SRC, "components")), ...sources(path.join(SRC, "app"))].flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/className="([^"]*\bfont-display\b[^"]*)"/g)]
        .filter(([, classes]) => /\bfont-(thin|extralight|light|semibold|bold|extrabold|black)\b/.test(classes))
        .map(([, classes]) => `${path.relative(SRC, file)}: ${classes}`),
    );
    expect(offenders).toEqual([]);
  });

  it("Bodoni Moda is gone from the website's runtime code", () => {
    const offenders = sources(SRC).filter((file) => /bodoni/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
