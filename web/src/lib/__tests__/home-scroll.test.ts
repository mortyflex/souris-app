import { describe, expect, it } from "vitest";

import { handleHomeLinkClick, homeLinkAction, settleHomeArrival, takeHomeArrival, type HomeClickEvent, type ScrollWindow } from "../home-scroll";

/** A window where the visitor has already scrolled — by wheel, trackpad, touch or scrollbar alike: none of them changes the URL. */
function fakeWindow({ search = "", hash = "", scrollY = 3200 }: { search?: string; hash?: string; scrollY?: number } = {}) {
  const pushed: unknown[][] = [];
  const scrolls: ScrollToOptions[] = [];
  const win: ScrollWindow & { scrollY: number } = {
    scrollY,
    location: { search, hash },
    history: { pushState: (...args: unknown[]) => void pushed.push(args) },
    scrollTo: (options: ScrollToOptions) => {
      scrolls.push(options);
      win.scrollY = options.top ?? win.scrollY;
    },
  };
  return { win, pushed, scrolls };
}

function click(overrides: Partial<HomeClickEvent> = {}) {
  let prevented = false;
  const event: HomeClickEvent = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault: () => {
      prevented = true;
    },
    ...overrides,
  };
  return { event, prevented: () => prevented };
}

describe("the logo always returns to the very top of the home page", () => {
  it("after a manual scroll at « / » (URL unchanged): the click is taken over and the page scrolls to 0, without a history entry", () => {
    const { win, pushed, scrolls } = fakeWindow({ scrollY: 3200 });
    const { event, prevented } = click();
    expect(handleHomeLinkClick("/", event, win, false)).toBe("scroll");
    expect(prevented()).toBe(true); // never a Next.js navigation to the same URL, which does nothing
    expect(scrolls).toEqual([{ top: 0, left: 0, behavior: "smooth" }]);
    expect(win.scrollY).toBe(0);
    expect(pushed).toEqual([]);
  });

  it("after a section link (« /#tarif »): scrolls to 0 — not under the header — and leaves the fragment with a new entry, so « Back » returns to the section", () => {
    for (const hash of ["#fonctionnalites", "#reservation-en-ligne", "#tarif", "#questions", "#tendances"]) {
      const { win, pushed, scrolls } = fakeWindow({ hash, scrollY: 7900 });
      const { event, prevented } = click();
      expect(handleHomeLinkClick("/", event, win, false), hash).toBe("scroll");
      expect(prevented()).toBe(true);
      expect(pushed, hash).toEqual([[null, "", "/"]]);
      expect(scrolls, hash).toEqual([{ top: 0, left: 0, behavior: "smooth" }]);
    }
  });

  it("a query is left the way a link to « / » leaves it", () => {
    const { win, pushed } = fakeWindow({ search: "?utm_source=test" });
    handleHomeLinkClick("/", click().event, win, false);
    expect(pushed).toEqual([[null, "", "/"]]);
  });

  it("already at the top of « / »: nothing moves, nothing is navigated, no history entry", () => {
    const { win, pushed, scrolls } = fakeWindow({ scrollY: 0 });
    const { event, prevented } = click();
    expect(handleHomeLinkClick("/", event, win, false)).toBe("scroll");
    expect(prevented()).toBe(true);
    expect(win.scrollY).toBe(0);
    expect(scrolls).toEqual([{ top: 0, left: 0, behavior: "smooth" }]);
    expect(pushed).toEqual([]);
  });

  it("under reduced motion, the return is immediate", () => {
    const { win, scrolls } = fakeWindow({ hash: "#tarif" });
    handleHomeLinkClick("/", click().event, win, true);
    expect(scrolls).toEqual([{ top: 0, left: 0, behavior: "instant" }]);
  });

  it("from another page: Next.js navigates (the click is not taken over), and the home page starts at its top on arrival — once", () => {
    takeHomeArrival(); // a clean slate
    const { event, prevented } = click();
    expect(handleHomeLinkClick("/r/atelier-celestine", event, fakeWindow().win, false)).toBe("navigate");
    expect(prevented()).toBe(false);

    // The home page's logo mounts at « / », the previous page's offset still applied.
    const home = fakeWindow({ scrollY: 24 });
    expect(settleHomeArrival("/", home.win)).toBe(true);
    expect(home.scrolls).toEqual([{ top: 0, left: 0, behavior: "instant" }]);
    expect(home.win.scrollY).toBe(0);

    // Any later visit (back / forward, a section link) keeps its own position.
    const later = fakeWindow({ scrollY: 7900 });
    expect(settleHomeArrival("/", later.win)).toBe(false);
    expect(later.scrolls).toEqual([]);
  });

  it("an arrival elsewhere than « / » is not touched", () => {
    takeHomeArrival();
    handleHomeLinkClick("/r/atelier-celestine", click().event, fakeWindow().win, false);
    const profile = fakeWindow({ scrollY: 300 });
    expect(settleHomeArrival("/r/autre", profile.win)).toBe(false);
    expect(profile.scrolls).toEqual([]);
    takeHomeArrival();
  });

  it("a new tab, a new window, a middle click or an already handled click stay the browser's", () => {
    for (const overrides of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      const { win, pushed, scrolls } = fakeWindow({ hash: "#tarif" });
      const { event, prevented } = click(overrides);
      expect(handleHomeLinkClick("/", event, win, false), JSON.stringify(overrides)).toBe("browser");
      expect(prevented()).toBe(false);
      expect(scrolls).toEqual([]);
      expect(pushed).toEqual([]);
      expect(homeLinkAction("/r/atelier-celestine", event)).toBe("browser");
    }
    expect(takeHomeArrival()).toBe(false); // nor marked as an arrival
  });
});
