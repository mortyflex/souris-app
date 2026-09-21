// Souris — what a Calendar Block card says at a given height
//
// « Indisponible » is the primary information and the reason is secondary —
// never a client, a service or a price. The densities are the ones of the
// Appointment cards (`getAgendaSegmentDensity`), so a 30-minute block reads
// like a 30-minute Appointment:
//
//   tall / medium   Indisponible          two lines
//                   Déplacement
//   compact         Indisponible · Pause  ONE line (15–25 minute blocks) —
//                                         never two lines squeezed, never a
//                                         smaller font
//   visual          (colour only)         too short for readable text; the
//                                         accessibility label still says it all

import type { CalendarBlock } from '@/domain/calendar-blocks';
import { CALENDAR_BLOCK_TITLE } from '@/features/calendar-blocks/presentation';

import { getAgendaSegmentDensity } from './segment-content';

export type CalendarBlockCardContent =
  | { readonly mode: 'lines'; readonly title: string; readonly reason: string }
  | { readonly mode: 'compact'; readonly title: string; readonly reason: string }
  | { readonly mode: 'visual' };

export function getCalendarBlockCardContent(
  calendarBlock: Pick<CalendarBlock, 'reason'>,
  height: number,
): CalendarBlockCardContent {
  const density = getAgendaSegmentDensity(height);
  if (density === 'visual') return { mode: 'visual' };
  return {
    mode: density === 'compact' ? 'compact' : 'lines',
    title: CALENDAR_BLOCK_TITLE,
    reason: calendarBlock.reason,
  };
}
