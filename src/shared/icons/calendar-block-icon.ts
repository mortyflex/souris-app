// BeautIzzy — Calendar Block icon
//
// The ONE glyph that marks personal unavailability — Agenda block, Week row,
// the creation form and the details sheet. Recognition never depends on it:
// the word « Indisponible » is always there. SF Symbols on iOS, Material
// Symbols on Android; never emoji.

import type { PlatformSymbolName } from './payment-method-icons';

export const calendarBlockIcon = {
  ios: 'calendar.badge.clock',
  android: 'event_busy',
} as const satisfies PlatformSymbolName;
