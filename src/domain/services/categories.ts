// BeautIzzy — Service categories (domain) — pure
//
// A ServiceCategory is a professional-defined group of catalogue Services
// (« Extensions et poses en gel », « Épilations », « Soins du visage »…).
// Business-scoped, with a STABLE id — a Service references the id, never the
// mutable name, so renaming a category moves nothing. Categories are free:
// BeautIzzy proposes examples in the UI, never a vocabulary, and never
// creates a category for an existing Business.
//
//   ServiceCategory
//   ├── id           stable, never regenerated
//   ├── businessId   ownership
//   ├── name         required, trimmed
//   ├── description? optional plain text (the Service description rule)
//   └── position     the professional's order (0, 1, 2…; ties by id)
//
// A Service without category, or whose category no longer exists, is
// « Sans catégorie »: the reference is catalogue metadata, never a
// constraint, so a category removed on another device can never break a
// Service. Deleting a category never deletes a Service: its Services become
// uncategorized (`detachServicesFromCategory`).
//
// Categories never reach an AppointmentItem snapshot, the timeline, a price
// or availability: they organise the catalogue, nothing else.

import type { Service } from '../appointments/types';
import { normalizeServiceDescription, SERVICE_DESCRIPTION_MAX_LENGTH } from './description';

export interface ServiceCategory {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly description?: string;
  readonly position: number;
}

export const SERVICE_CATEGORY_NAME_MAX_LENGTH = 60;

/** The domain refused a category: nothing was written. */
export class ServiceCategoryInvalidError extends Error {
  constructor(readonly reason: 'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'DESCRIPTION_TOO_LONG' | 'POSITION_INVALID') {
    super(`Invalid service category: ${reason}`);
    this.name = 'ServiceCategoryInvalidError';
  }
}

/** Trims and collapses inner runs of whitespace (a name is one line). */
export function normalizeServiceCategoryName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isValidServiceCategoryName(value: string): boolean {
  const name = normalizeServiceCategoryName(value);
  return name.length > 0 && name.length <= SERVICE_CATEGORY_NAME_MAX_LENGTH;
}

/** The canonical record: normalised name and description. Throws `ServiceCategoryInvalidError`. */
export function createServiceCategory(input: {
  readonly id: string;
  readonly businessId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly position: number;
}): ServiceCategory {
  const name = normalizeServiceCategoryName(input.name);
  if (name.length === 0) throw new ServiceCategoryInvalidError('NAME_REQUIRED');
  if (name.length > SERVICE_CATEGORY_NAME_MAX_LENGTH) throw new ServiceCategoryInvalidError('NAME_TOO_LONG');
  const description = normalizeServiceDescription(input.description);
  if (description !== undefined && description.length > SERVICE_DESCRIPTION_MAX_LENGTH) {
    throw new ServiceCategoryInvalidError('DESCRIPTION_TOO_LONG');
  }
  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new ServiceCategoryInvalidError('POSITION_INVALID');
  }
  return {
    id: input.id,
    businessId: input.businessId,
    name,
    ...(description !== undefined && { description }),
    position: input.position,
  };
}

/** The professional's order: position, then id (two devices may pick the same position). */
export function sortServiceCategories(categories: readonly ServiceCategory[]): readonly ServiceCategory[] {
  return [...categories].sort(
    (left, right) => left.position - right.position || left.id.localeCompare(right.id),
  );
}

/** The position of a category appended at the end. */
export function nextServiceCategoryPosition(categories: readonly ServiceCategory[]): number {
  return categories.reduce((max, category) => Math.max(max, category.position + 1), 0);
}

/**
 * Moves one category to `toIndex` of the ordered list (a drop of the
 * drag-and-drop reorder) and renumbers the whole list 0…n-1. Returns ONLY the
 * categories whose position changed, so the caller writes (and syncs) nothing
 * else. An unknown category or an index outside the list changes nothing.
 */
export function moveServiceCategory(
  categories: readonly ServiceCategory[],
  categoryId: string,
  toIndex: number,
): readonly ServiceCategory[] {
  const ordered = [...sortServiceCategories(categories)];
  const from = ordered.findIndex((category) => category.id === categoryId);
  const to = toIndex;
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= ordered.length) return [];
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved!);
  return ordered
    .map((category, position) => ({ category, position }))
    .filter(({ category, position }) => category.position !== position)
    .map(({ category, position }) => ({ ...category, position }));
}

/** The category of a Service, or undefined when it has none or names a category that does not exist. */
export function resolveServiceCategory(
  service: Pick<Service, 'categoryId'>,
  categories: readonly ServiceCategory[],
): ServiceCategory | undefined {
  if (service.categoryId === undefined) return undefined;
  return categories.find((category) => category.id === service.categoryId);
}

/** The Services referencing `categoryId`, made uncategorized (deleting a category deletes no Service). */
export function detachServicesFromCategory(
  services: readonly Service[],
  categoryId: string,
): readonly Service[] {
  return services
    .filter((service) => service.categoryId === categoryId)
    .map(({ categoryId: _categoryId, ...rest }) => rest);
}

export interface ServiceCategoryGroup<Item> {
  /** Undefined for « Sans catégorie ». */
  readonly category: ServiceCategory | undefined;
  readonly items: readonly Item[];
}

/**
 * Groups Services under their categories, in the professional's category
 * order, then the uncategorized ones (unknown references included) last.
 * Source order is kept inside a group; empty groups are omitted unless
 * `includeEmpty` (the management screen lists every category).
 */
export function groupServicesByCategory<Item extends Pick<Service, 'categoryId'>>(
  services: readonly Item[],
  categories: readonly ServiceCategory[],
  options: { readonly includeEmpty?: boolean } = {},
): readonly ServiceCategoryGroup<Item>[] {
  const ordered = sortServiceCategories(categories);
  const known = new Set(ordered.map((category) => category.id));
  const groups: ServiceCategoryGroup<Item>[] = ordered.map((category) => ({
    category,
    items: services.filter((service) => service.categoryId === category.id),
  }));
  groups.push({
    category: undefined,
    items: services.filter((service) => service.categoryId === undefined || !known.has(service.categoryId)),
  });
  return options.includeEmpty
    ? groups.filter((group) => group.category !== undefined || group.items.length > 0)
    : groups.filter((group) => group.items.length > 0);
}
