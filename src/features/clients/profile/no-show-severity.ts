// BeautIzzy — No-show severity (presentation only)
//
// Grades the EXISTING no-show count of the client profile
// (`ClientActivitySummary.noShowAppointmentCount`, NO_SHOW appointments only)
// so the « Absences » stat card can hint at a recurring pattern. Pure
// presentation: it never counts, stores or scores anything, and it knows
// nothing about appointments, mutations or subscriptions.

import { caution } from '@/shared/ui/theme';

import type { ProfileStatCardAccent } from './components/ProfileStatCard';

export type NoShowSeverity = 'neutral' | 'low' | 'moderate' | 'high';

/**
 * Exact thresholds (product decision, October 2026):
 *   0      → neutral
 *   1 – 2  → low      (amber)
 *   3 – 5  → moderate (orange)
 *   6 +    → high     (red)
 *
 * Anything that is not a finite non-negative number reads as neutral: the
 * card then looks exactly as before, never wrongly alarming.
 */
export function getNoShowSeverity(count: unknown): NoShowSeverity {
  if (typeof count !== 'number' || !Number.isFinite(count)) return 'neutral';

  const noShows = Math.floor(count);
  if (noShows >= 6) return 'high';
  if (noShows >= 3) return 'moderate';
  if (noShows >= 1) return 'low';
  return 'neutral';
}

/**
 * Spoken severity, appended to the card's accessibility label so the
 * pattern never depends on colour alone. Neutral says nothing: the card
 * keeps its historical « Absences, 0 ».
 */
const NO_SHOW_SEVERITY_DESCRIPTIONS: Readonly<Record<NoShowSeverity, string | undefined>> = {
  neutral: undefined,
  low: 'à surveiller',
  moderate: 'absences répétées',
  high: 'absences fréquentes',
};

export function describeNoShowSeverity(severity: NoShowSeverity): string | undefined {
  return NO_SHOW_SEVERITY_DESCRIPTIONS[severity];
}

/** The outline of the « Absences » card; `undefined` keeps the neutral card. */
const NO_SHOW_SEVERITY_ACCENTS: Readonly<Record<NoShowSeverity, ProfileStatCardAccent | undefined>> =
  {
    neutral: undefined,
    low: { color: caution.amber600 },
    moderate: { color: caution.orange600 },
    high: { color: caution.red600 },
  };

export function getNoShowSeverityAccent(
  severity: NoShowSeverity,
): ProfileStatCardAccent | undefined {
  return NO_SHOW_SEVERITY_ACCENTS[severity];
}
