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
 * Normalizes a single legacy technique record into a canonical Service.
 *
 * Mapping rules (approved current product distinction):
 * - category + name → id (deterministic, slugified — stable regardless of type)
 * - name → name
 * - price: must be numeric, otherwise returns null
 * - break > 0 → TECHNIQUE: an active phase (requiresStaff true) followed by
 *   the processing phase (requiresStaff false)
 * - break === 0 → SERVICE: the record represents one continuous
 *   professional-occupied service, normalized to a single staff-required
 *   phase. No fake zero-minute processing phase is created.
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

  // No real processing time: this is a simple professional-occupied service.
  if (legacy.break <= 0) {
    const activePhaseId = `${techniqueId}-active`;
    return {
      id: techniqueId,
      businessId,
      name: legacy.name,
      type: 'SERVICE',
      price: legacy.price,
      phases: [
        {
          id: activePhaseId,
          name: legacy.name,
          durationMinutes: legacy.duration,
          requiresStaff: true,
        },
      ],
      active: true,
    };
  }

  const phases: ServicePhase[] = [];

  // Active phase (always present)
  const activePhaseId = `${techniqueId}-active`;
  phases.push({
    id: activePhaseId,
    name: legacy.name,
    durationMinutes: legacy.duration,
    requiresStaff: true,
  });

  // Processing phase (break > 0)
  const processingPhaseId = `${techniqueId}-processing`;
  phases.push({
    id: processingPhaseId,
    name: 'Temps de pose',
    durationMinutes: legacy.break,
    requiresStaff: false,
  });

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
