// BeautIzzy — insights icon
//
// The ONE glyph of « Tops & tendances »: the Agenda + menu option and the
// receipt header. A rising line chart — `chart.line.uptrend.xyaxis` ships
// with SF Symbols 4 (iOS 16), inside the iOS 16.4 deployment target. SF
// Symbols on iOS, Material Symbols on Android; never emoji.

import type { PlatformSymbolName } from './payment-method-icons';

export const insightsIcon = {
  ios: 'chart.line.uptrend.xyaxis',
  android: 'trending_up',
} as const satisfies PlatformSymbolName;
