import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

describe("motion primitives, as the server renders them", () => {
  it("Spinner and Skeleton are decorative, and turn only when motion is welcome", () => {
    const spinner = renderToStaticMarkup(<Spinner />);
    expect(spinner).toContain('aria-hidden="true"');
    expect(spinner).toContain("motion-safe:animate-spin");
    const skeleton = renderToStaticMarkup(<Skeleton className="h-11" />);
    expect(skeleton).toContain('aria-hidden="true"');
    expect(skeleton).toContain("skeleton");
  });
});
