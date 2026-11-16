import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import { DemoNumber } from "../demo-number";
import { formatValue } from "../format-value";
import { Reveal } from "../reveal";

describe("motion primitives, as the server renders them", () => {
  it("Reveal never hides anything on the server (no JavaScript, crawlers, reduced motion)", () => {
    const html = renderToStaticMarkup(
      <Reveal as="section" delay={160}>
        <p>Contenu</p>
      </Reveal>,
    );
    expect(html).toBe("<section><p>Contenu</p></section>");
    expect(html).not.toContain("data-reveal");
  });

  it("DemoNumber renders the FINAL value, and speaks it once", () => {
    const html = renderToStaticMarkup(<DemoNumber value={1280} format="euros" />);
    const text = html.replace(/<[^>]+>/g, "|");
    expect(text).toContain(formatValue(1280, "euros"));
    expect(html).toMatch(/<span aria-hidden="true" class="tabular-nums">/);
    expect(html).toMatch(/<span class="sr-only">/);
  });

  it("formats French figures", () => {
    expect(formatValue(12, "integer")).toBe("12");
    expect(formatValue(1280, "integer").replace(/\s/g, " ")).toBe("1 280");
    expect(formatValue(129, "euros").replace(/\s/g, " ")).toBe("129 €");
    expect(formatValue(12.99, "euros-cents").replace(/\s/g, " ")).toBe("12,99 €");
  });

  it("Spinner and Skeleton are decorative, and turn only when motion is welcome", () => {
    const spinner = renderToStaticMarkup(<Spinner />);
    expect(spinner).toContain('aria-hidden="true"');
    expect(spinner).toContain("motion-safe:animate-spin");
    const skeleton = renderToStaticMarkup(<Skeleton className="h-11" />);
    expect(skeleton).toContain('aria-hidden="true"');
    expect(skeleton).toContain("skeleton");
  });
});
