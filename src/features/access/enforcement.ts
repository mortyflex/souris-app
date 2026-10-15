// BeautIzzy — the subscription enforcement switch (BeautIzzy Plus)
//
// Whether the subscription decides what the professional may do. A BUILD
// constant: never a setting, a remote flag, or a control in the UI. It stays
// `disabled` until the paywall phase, so every professional keeps full access
// whatever her subscription says. Turning it on is a product decision made in
// code, reviewed and shipped with the paywall — never flipped at runtime.

import type { AccessEnforcement } from '@/domain/access';

export const SUBSCRIPTION_ENFORCEMENT: AccessEnforcement = 'disabled';
