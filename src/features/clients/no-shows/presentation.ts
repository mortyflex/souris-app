// BeautIzzy — no-show warning copy (Appointment creation)
//
// The contextual warning shown while a Client with no-shows is chosen for a
// new Appointment: in the fixed footer of the Client step, right above
// « Continuer », and again in the footer of the Résumé, right above « Créer le
// rendez-vous ». Concise on purpose — a title and ONE supporting line — so it
// never dominates the footer. Informative and non-blocking: it never prevents
// the creation, never adds a deposit, never stores anything. The severity scale
// is the one of the Client profile's « Absences » card.

import {
  getNoShowSeverity,
  getNoShowSeverityAccent,
  type NoShowSeverity,
} from '@/features/clients/profile/no-show-severity';
import { cautionTint } from '@/shared/ui/theme';

import type { ClientAttendanceHistory } from './attendance';

export type ClientNoShowWarningKind =
  /** The most recent past Appointment with a known outcome was a NO_SHOW. */
  | 'LAST_MISSED'
  /** The Client has no-shows, but came last time — or the last outcome is unknown. */
  | 'HISTORY';

export interface ClientNoShowWarning {
  readonly kind: ClientNoShowWarningKind;
  readonly noShowCount: number;
  readonly severity: Exclude<NoShowSeverity, 'neutral'>;
  readonly title: string;
  /** ONE supporting line: the recorded count, then the deposit hint when the last one was missed. */
  readonly summary: string;
  /** The whole warning as one spoken sentence. */
  readonly accessibilityLabel: string;
}

export const LAST_MISSED_TITLE = 'Dernier rendez-vous non honoré';
export const NO_SHOW_HISTORY_TITLE = "Historique d'absences";
export const DEPOSIT_HINT = 'Pensez à demander un acompte.';

/** « 1 absence enregistrée. » / « 3 absences enregistrées. » */
export function formatRecordedNoShows(count: number): string {
  return count === 1 ? '1 absence enregistrée.' : `${count} absences enregistrées.`;
}

/**
 * The warning for one Client, or `undefined` when there is nothing to say
 * (no no-show): the creation experience then stays exactly as it was.
 *
 * « Dernier rendez-vous non honoré » is claimed ONLY when the latest past
 * outcome is a known NO_SHOW. A Client who came back since, or whose most
 * recent Appointment was never closed, gets the history wording — the count
 * alone, no claim about the last visit.
 */
export function getClientNoShowWarning(
  history: ClientAttendanceHistory,
): ClientNoShowWarning | undefined {
  const severity = getNoShowSeverity(history.noShowCount);
  if (severity === 'neutral') return undefined;

  const { noShowCount } = history;
  const recorded = formatRecordedNoShows(noShowCount);
  const lastMissed = history.latestOutcome === 'NO_SHOW';
  const title = lastMissed ? LAST_MISSED_TITLE : NO_SHOW_HISTORY_TITLE;
  const summary = lastMissed ? `${recorded} ${DEPOSIT_HINT}` : recorded;

  return {
    kind: lastMissed ? 'LAST_MISSED' : 'HISTORY',
    noShowCount,
    severity,
    title,
    summary,
    accessibilityLabel: `${title}. ${summary}`,
  };
}

export interface NoShowWarningColors {
  /** Outline of the notice and tint of its glyph. */
  readonly accent: string;
  /** The quiet disc behind the glyph. */
  readonly badge: string;
}

const BADGE_TINTS: Readonly<Record<Exclude<NoShowSeverity, 'neutral'>, string>> = {
  low: cautionTint.amber,
  moderate: cautionTint.orange,
  high: cautionTint.red,
};

/** Amber for 1–2, orange for 3–5, red for 6 and more — the profile's scale. */
export function getNoShowWarningColors(
  severity: Exclude<NoShowSeverity, 'neutral'>,
): NoShowWarningColors {
  const accent = getNoShowSeverityAccent(severity);
  return { accent: accent?.color ?? BADGE_TINTS[severity], badge: BADGE_TINTS[severity] };
}
