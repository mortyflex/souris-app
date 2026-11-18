import { describe, expect, it } from "vitest";

import {
  clearSavedSelection,
  readSavedSelection,
  saveSelection,
  selectionStorageKey,
  type SelectionStore,
} from "../selection-storage";

function memoryStore(): SelectionStore & { readonly entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

const throwing: SelectionStore = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
};

describe("the selection saved in the tab — service ids only", () => {
  it("saves and reads back the ids in her order, per page", () => {
    const store = memoryStore();
    saveSelection(store, "chez-amelie", ["svc-couleur", "svc-coupe"]);
    expect(readSavedSelection(store, "chez-amelie")).toEqual(["svc-couleur", "svc-coupe"]);
    expect(readSavedSelection(store, "autre-page")).toEqual([]);
  });

  it("stores nothing but the ids: no name, no contact, no time", () => {
    const store = memoryStore();
    saveSelection(store, "chez-amelie", ["svc-couleur"]);
    expect([...store.entries.keys()]).toEqual([selectionStorageKey("chez-amelie")]);
    expect(JSON.parse(store.entries.get(selectionStorageKey("chez-amelie"))!)).toEqual({ v: 1, ids: ["svc-couleur"] });
  });

  it("an empty selection and a confirmed booking remove the entry", () => {
    const store = memoryStore();
    saveSelection(store, "chez-amelie", ["svc-coupe"]);
    saveSelection(store, "chez-amelie", []);
    expect(store.entries.size).toBe(0);
    saveSelection(store, "chez-amelie", ["svc-coupe"]);
    clearSavedSelection(store, "chez-amelie");
    expect(store.entries.size).toBe(0);
  });

  it("reads anything that is not ours as nothing saved", () => {
    const store = memoryStore();
    const key = selectionStorageKey("chez-amelie");
    for (const raw of [
      "not json",
      "[]",
      JSON.stringify({ v: 2, ids: ["svc-coupe"] }),
      JSON.stringify({ v: 1, ids: ["svc-coupe"], email: "marie@example.test" }),
      JSON.stringify({ v: 1, ids: ["svc-coupe", "svc-coupe"] }),
      JSON.stringify({ v: 1, ids: Array.from({ length: 9 }, (_, index) => `svc-${index}`) }),
      JSON.stringify({ v: 1, ids: ["<script>"] }),
      "x".repeat(5000),
    ]) {
      store.entries.set(key, raw);
      expect(readSavedSelection(store, "chez-amelie")).toEqual([]);
    }
  });

  it("never breaks without a storage, or with one that refuses", () => {
    expect(readSavedSelection(undefined, "chez-amelie")).toEqual([]);
    expect(() => saveSelection(undefined, "chez-amelie", ["svc-coupe"])).not.toThrow();
    expect(readSavedSelection(throwing, "chez-amelie")).toEqual([]);
    expect(() => saveSelection(throwing, "chez-amelie", ["svc-coupe"])).not.toThrow();
    expect(() => clearSavedSelection(throwing, "chez-amelie")).not.toThrow();
  });
});
