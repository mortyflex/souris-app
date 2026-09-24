// Souris — day summary icon
//
// The ONE glyph of « Résumé du jour » and « Résumé de la semaine »: the Agenda
// + menu option and the receipt header. A listed slip of paper — available on every supported iOS
// version (the dedicated `receipt` symbol is not). SF Symbols on iOS, Material
// Symbols on Android; never emoji.

import type { PlatformSymbolName } from './payment-method-icons';

export const daySummaryIcon = {
  ios: 'list.bullet.rectangle.portrait',
  android: 'receipt_long',
} as const satisfies PlatformSymbolName;
