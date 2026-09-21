// Souris — Calendar Block reason shortcuts
//
// The quick suggestions are a UX shortcut ONLY: what is saved is ordinary
// text (`CalendarBlock.reason`), never an enum. « Autre » is not a reason —
// it opens the free-text field, and the text typed there is the reason.

import { normalizeCalendarBlockReason } from '@/domain/calendar-blocks';

export const REASON_SUGGESTIONS = [
  'Pause',
  'Personnel',
  'Déplacement',
  'Administratif',
  'Formation',
] as const;

export const OTHER_REASON_LABEL = 'Autre';

/** Every chip, in display order. */
export const REASON_CHIPS: readonly string[] = [...REASON_SUGGESTIONS, OTHER_REASON_LABEL];

export interface ReasonDraft {
  /** The selected chip label, or undefined while nothing is chosen. */
  readonly chip: string | undefined;
  /** Free text, used only while « Autre » is selected. */
  readonly customText: string;
}

export const EMPTY_REASON_DRAFT: ReasonDraft = { chip: undefined, customText: '' };

/** Opens the editor on an existing reason: a known suggestion selects its chip, anything else is « Autre ». */
export function toReasonDraft(reason: string | undefined): ReasonDraft {
  const normalized = normalizeCalendarBlockReason(reason);
  if (normalized === undefined) return EMPTY_REASON_DRAFT;
  const suggestion = REASON_SUGGESTIONS.find((label) => label === normalized);
  return suggestion
    ? { chip: suggestion, customText: '' }
    : { chip: OTHER_REASON_LABEL, customText: normalized };
}

export function isOtherReasonSelected(draft: ReasonDraft): boolean {
  return draft.chip === OTHER_REASON_LABEL;
}

/** The text that would be saved, or undefined when the draft holds no meaningful reason yet. */
export function resolveReason(draft: ReasonDraft): string | undefined {
  if (draft.chip === undefined) return undefined;
  return normalizeCalendarBlockReason(isOtherReasonSelected(draft) ? draft.customText : draft.chip);
}
