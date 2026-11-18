import { describe, expect, it } from "vitest";

import type { BookableService } from "../availability";
import {
  descriptionParagraphs,
  formatServicePrice,
  groupBookableServices,
  isClamped,
  OTHER_SERVICES_TITLE,
  PRICE_TO_CONFIRM,
  showsAnyPrice,
} from "../service-catalog";

/** Intl writes a narrow no-break space before « € »: compare on plain spaces (built from code points). */
const SPACES = new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', "g");
const plain = (text: string | undefined) => text?.replace(SPACES, " ");

const service = (id: string, extra: Partial<BookableService> = {}): BookableService => ({
  id,
  name: id,
  durationMinutes: 30,
  ...extra,
});
const visage = { id: "cat-visage", name: "Soins du visage", position: 0 };
const epilation = { id: "cat-epilation", name: "Épilations", position: 1 };

describe("formatServicePrice", () => {
  it("shows the server's positive price in euros, cents only when there are some", () => {
    expect(plain(formatServicePrice(4500))).toBe("45 €");
    expect(plain(formatServicePrice(4550))).toBe("45,50 €");
    expect(plain(formatServicePrice(1))).toBe("0,01 €");
    expect(plain(formatServicePrice(125000))).toBe("1 250 €");
  });

  it("reads 0 as « Tarif à confirmer » — never free", () => {
    expect(formatServicePrice(0)).toBe(PRICE_TO_CONFIRM);
    expect(formatServicePrice(0)).toBe("Tarif à confirmer");
    expect(formatServicePrice(0)).not.toMatch(/gratuit|0 €|0,00/i);
  });

  it("shows nothing when the server gave no price, or something that is not one", () => {
    expect(formatServicePrice(undefined)).toBeUndefined();
    expect(formatServicePrice(-1)).toBeUndefined();
    expect(formatServicePrice(45.5)).toBeUndefined();
    expect(formatServicePrice(Number.NaN)).toBeUndefined();
  });

  it("says prices are indicative only when one is shown", () => {
    expect(showsAnyPrice([service("a"), service("b")])).toBe(false);
    expect(showsAnyPrice([service("a"), service("b", { priceCents: 0 })])).toBe(true);
    expect(showsAnyPrice([])).toBe(false);
  });
});

describe("groupBookableServices", () => {
  it("keeps the plain list, in the server's order, without categories (a server without the metadata)", () => {
    const services = [service("coupe"), service("brushing"), service("couleur")];
    expect(groupBookableServices(services)).toEqual([{ key: "all", services }]);
    expect(groupBookableServices([])).toEqual([]);
  });

  it("follows her categories in her order, the server's order inside, the uncategorized last", () => {
    const services = [
      service("sourcils", { category: epilation }),
      service("masque", { category: visage }),
      service("bon-cadeau"),
      service("aisselles", { category: epilation }),
      service("hydratant", { category: visage }),
    ];
    const groups = groupBookableServices(services);
    expect(groups.map((group) => [group.title, group.services.map((item) => item.id)])).toEqual([
      ["Soins du visage", ["masque", "hydratant"]],
      ["Épilations", ["sourcils", "aisselles"]],
      [OTHER_SERVICES_TITLE, ["bon-cadeau"]],
    ]);
    expect(OTHER_SERVICES_TITLE).toBe("Autres prestations");
    // Every bookable service is still offered, exactly once.
    expect(groups.flatMap((group) => group.services.map((item) => item.id)).sort()).toEqual(services.map((item) => item.id).sort());
  });

  it("breaks a tie of positions by the category id", () => {
    const b = { id: "cat-b", name: "B", position: 3 };
    const a = { id: "cat-a", name: "A", position: 3 };
    expect(groupBookableServices([service("x", { category: b }), service("y", { category: a })]).map((group) => group.title)).toEqual(["A", "B"]);
  });

  it("drops the heading of a catalogue that is one single category", () => {
    const services = [service("masque", { category: visage }), service("hydratant", { category: visage })];
    const groups = groupBookableServices(services);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBeUndefined();
    expect(groups[0]!.services.map((item) => item.id)).toEqual(["masque", "hydratant"]);
  });

  it("keeps the uncategorized services available next to one category, both titled", () => {
    const groups = groupBookableServices([service("masque", { category: visage }), service("libre")]);
    expect(groups.map((group) => group.title)).toEqual(["Soins du visage", "Autres prestations"]);
  });
});

describe("isClamped", () => {
  it("is true only when the clamped text hides some of its content", () => {
    expect(isClamped({ scrollHeight: 120, clientHeight: 48 })).toBe(true);
    expect(isClamped({ scrollHeight: 48, clientHeight: 48 })).toBe(false);
    // Sub-pixel rounding is not truncation.
    expect(isClamped({ scrollHeight: 49, clientHeight: 48 })).toBe(false);
  });
});

describe("descriptionParagraphs", () => {
  it("splits on blank lines and keeps the line breaks inside a paragraph", () => {
    expect(descriptionParagraphs("Un soin complet.\n\nNettoyage, gommage\npuis masque.")).toEqual(["Un soin complet.", "Nettoyage, gommage\npuis masque."]);
  });

  it("makes no empty paragraph from runs of blank lines, blank lines with spaces, or edges", () => {
    expect(descriptionParagraphs("\n\nA.\n \n\n\t\nB.\n\n")).toEqual(["A.", "B."]);
    expect(descriptionParagraphs("A.\r\n\r\nB.\r\nC.")).toEqual(["A.", "B.\nC."]);
  });

  it("adds nothing and cuts nothing: the server's words, in order", () => {
    const text = "Première phrase sans point final\n\nDeuxième — avec « guillemets » et 1 000 caractères au plus";
    const paragraphs = descriptionParagraphs(text);
    expect(paragraphs.join("\n\n")).toBe(text);
    expect(paragraphs.join("")).not.toContain("…");
  });

  it("keeps a one-paragraph description whole, and reads blank text as nothing", () => {
    expect(descriptionParagraphs("Rehaussement et teinture des cils.\nVenez sans lentilles.")).toEqual(["Rehaussement et teinture des cils.\nVenez sans lentilles."]);
    expect(descriptionParagraphs("  \n \n")).toEqual([]);
  });
});
