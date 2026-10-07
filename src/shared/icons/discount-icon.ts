// BeautIzzy — Appointment discount icon
//
// The ONE glyph that marks « Réduction » on an Appointment: a price tag,
// which reads the same for a percentage and for a fixed amount. SF Symbols on
// iOS, Material Symbols on Android; never emoji, never a warning glyph.

import type { PlatformSymbolName } from './payment-method-icons';

export const discountIcon = { ios: 'tag', android: 'sell' } as const satisfies PlatformSymbolName;
