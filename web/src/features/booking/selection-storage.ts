/**
 * The customer's selection survives a reload of the booking page — and
 * nothing else does.
 *
 * Stored in the TAB's session storage only (gone with the tab), per page:
 * the selected service IDS in her order, and never anything she typed — no
 * name, no contact, no time. A restored list is only a wish: it is checked
 * again against the page's current services (`RESTORE` in `booking-flow.ts`),
 * and the server decides again at every read and at the booking.
 *
 * Every access is guarded: a browser without storage, a private window, a
 * full or blocked storage, a value that is not ours — all read as "nothing
 * saved" and never break the flow. Pure of React; the storage is injected.
 */

import { MAX_SELECTED_SERVICES, selectionIssue } from "@/features/availability/selection";

/** The part of `Storage` used here. */
export interface SelectionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VERSION = 1;
/** Eight ids of at most 200 characters, with room: anything larger is not ours. */
const MAX_STORED_LENGTH = 4096;

export function selectionStorageKey(slug: string): string {
  return `beautizzy:booking-selection:${slug}`;
}

/** The tab's session storage, or undefined when the browser refuses it. */
export function sessionStore(): SelectionStore | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The saved ids, in order — or an empty list (nothing saved, unreadable, not ours). */
export function readSavedSelection(store: SelectionStore | undefined, slug: string): readonly string[] {
  if (store === undefined) return [];
  let raw: string | null;
  try {
    raw = store.getItem(selectionStorageKey(slug));
  } catch {
    return [];
  }
  if (raw === null || raw.length > MAX_STORED_LENGTH) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const { v, ids } = value as { v?: unknown; ids?: unknown };
    if (v !== VERSION || Object.keys(value).length !== 2) return [];
    // A list the page would never have saved (too long, duplicated, malformed) is not restored at all.
    return Array.isArray(ids) && selectionIssue(ids) === undefined ? (ids as string[]).slice(0, MAX_SELECTED_SERVICES) : [];
  } catch {
    return [];
  }
}

/** Saves the ids in order; an empty selection removes the entry. Never throws. */
export function saveSelection(store: SelectionStore | undefined, slug: string, ids: readonly string[]): void {
  if (store === undefined) return;
  try {
    if (ids.length === 0) store.removeItem(selectionStorageKey(slug));
    else store.setItem(selectionStorageKey(slug), JSON.stringify({ v: VERSION, ids }));
  } catch {
    // Storage full or refused: the selection simply does not survive a reload.
  }
}

/** Forgets the selection (after a confirmed booking). Never throws. */
export function clearSavedSelection(store: SelectionStore | undefined, slug: string): void {
  saveSelection(store, slug, []);
}
