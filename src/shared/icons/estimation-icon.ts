// BeautIzzy — estimation icon
//
// The glyph of « Estimation » in the Agenda + menu: a written document with a
// price, available on every supported iOS version. SF Symbols on iOS,
// Material Symbols on Android; never emoji.

import type { PlatformSymbolName } from './payment-method-icons';

export const estimationIcon = {
  ios: 'doc.text',
  android: 'request_quote',
} as const satisfies PlatformSymbolName;
