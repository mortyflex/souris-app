// Souris — retail sale icon
//
// Appointment Details and « Vendre un produit » on the Client Profile. SF
// Symbols on iOS, Material Symbols on Android; never emoji.

import type { PlatformSymbolName } from './payment-method-icons';

export const saleIcon = { ios: 'bag.fill', android: 'shopping_bag' } as const satisfies PlatformSymbolName;
