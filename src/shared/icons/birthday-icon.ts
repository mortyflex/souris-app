// Souris — Client birthday icon
//
// The ONE glyph that marks a Client birthday, shared by the Clientes
// directory row and the Client Profile. SF Symbols on iOS, Material Symbols
// on Android; never emoji.

import type { PlatformSymbolName } from './payment-method-icons';

export const birthdayIcon = { ios: 'birthday.cake', android: 'cake' } as const satisfies PlatformSymbolName;
