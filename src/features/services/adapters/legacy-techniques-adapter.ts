// Souris — Legacy techniques adapter
//
// Source: src/features/services/data/legacy-techniques.ts
// Target: Canonical Souris Service (src/domain/appointments/types.ts)
//
// This adapter transforms the legacy TECHNIQUE records into canonical
// Souris Service objects. Techniques may have processing time (break > 0)
// where the professional is not actively required.

import type { Service, ServicePhase } from '@/domain/appointments';
import type { PackageItem } from '../data/legacy-techniques';

export type LegacyTechnique = Readonly<PackageItem>;

export interface LegacyTechniqueCategory {
  readonly category: string;
  readonly techniques: readonly LegacyTechnique[];
}

export interface AdapterDiagnostic {
  readonly source: 'service' | 'technique';
  readonly category: string;
  readonly name: string;
  readonly reason: string;
}

export interface TechniquesAdapterResult {
  readonly techniques: readonly Service[];
  readonly diagnostics: readonly AdapterDiagnostic[];
}

/**
 * Generates a deterministic technique ID from category and name.
 * Format: "technique-{category-slug}-{name-slug}"
 *
 * Slugification:
 * - lowercase
 * - replace spaces with hyphens
 * - remove non-alphanumeric/hyphen characters
 * - collapse multiple hyphens
 */
export function generateTechniqueId(category: string, name: string): string {
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  return `technique-${slugify(category)}-${slugify(name)}`;
}

/**
 * Normalizes a single legacy technique into a canonical Service.
 *
 * Mapping rules:
 * - category + name → id (deterministic, slugified)
 * - name → name
 * - type: always "TECHNIQUE"
 * - price: must be numeric, otherwise returns null
 * - duration → active phase with requiresStaff: true
 * - break > 0 → processing phase with requiresStaff: false
 * - break === 0 → no processing phase (treated like a service)
 * - color: IGNORED (design system owns colors)
 *
 * Returns null if price is non-numeric (e.g., "Multiprix").
 */
export function normalizeLegacyTechnique(
  legacy: LegacyTechnique,
  category: string,
  businessId: string,
): Service | null {
  // Validate price
  if (typeof legacy.price !== 'number' || !Number.isFinite(legacy.price)) {
    return null;
  }

  const techniqueId = generateTechniqueId(category, legacy.name);
  const phases: ServicePhase[] = [];

  // Active phase (always present)
  const activePhaseId = `${techniqueId}-active`;
  phases.push({
    id: activePhaseId,
    name: legacy.name,
    durationMinutes: legacy.duration,
    requiresStaff: true,
  });

  // Processing phase (only if break > 0)
  if (legacy.break > 0) {
    const processingPhaseId = `${techniqueId}-processing`;
    phases.push({
      id: processingPhaseId,
      name: 'Temps de pose',
      durationMinutes: legacy.break,
      requiresStaff: false,
    });
  }

  return {
    id: techniqueId,
    businessId,
    name: legacy.name,
    type: 'TECHNIQUE',
    price: legacy.price,
    phases,
    active: true,
  };
}

/**
 * Normalizes a category of legacy techniques.
 *
 * Returns:
 * - techniques: successfully normalized techniques
 * - diagnostics: techniques that were excluded (e.g., non-numeric prices)
 */
export function normalizeLegacyTechniqueCategory(
  categoryData: LegacyTechniqueCategory,
  businessId: string,
): TechniquesAdapterResult {
  const techniques: Service[] = [];
  const diagnostics: AdapterDiagnostic[] = [];

  for (const legacy of categoryData.techniques) {
    const normalized = normalizeLegacyTechnique(legacy, categoryData.category, businessId);

    if (normalized) {
      techniques.push(normalized);
    } else {
      diagnostics.push({
        source: 'technique',
        category: categoryData.category,
        name: legacy.name,
        reason: `Non-numeric price: ${legacy.price}`,
      });
    }
  }

  return { techniques, diagnostics };
}

/**
 * Batch-normalizes multiple categories of legacy techniques.
 * Convenience wrapper for normalizeLegacyTechniqueCategory.
 */
export function normalizeLegacyTechniques(
  categories: readonly LegacyTechniqueCategory[],
  businessId: string,
): TechniquesAdapterResult {
  const allTechniques: Service[] = [];
  const allDiagnostics: AdapterDiagnostic[] = [];

  for (const category of categories) {
    const result = normalizeLegacyTechniqueCategory(category, businessId);
    allTechniques.push(...result.techniques);
    allDiagnostics.push(...result.diagnostics);
  }

  return { techniques: allTechniques, diagnostics: allDiagnostics };
}
