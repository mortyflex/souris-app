// BeautIzzy — trend direction icons
//
// The ONE glyph per trend direction of the Caisse comparisons (« Total
// encaissé », product units). A diagonal arrow for a rise or a fall, a flat
// arrow when nothing moved. SF Symbols on iOS, Material Symbols on Android;
// never emoji. Colour never carries the direction alone: the glyph and the
// written value go with it.

import type { CashRegisterTrendDirection } from '@/domain/cash-register';

import type { PlatformSymbolName } from './payment-method-icons';

export const trendIcons = {
  UP: { ios: 'arrow.up.right', android: 'trending_up' },
  DOWN: { ios: 'arrow.down.right', android: 'trending_down' },
  FLAT: { ios: 'arrow.right', android: 'trending_flat' },
} as const satisfies Record<CashRegisterTrendDirection, PlatformSymbolName>;
