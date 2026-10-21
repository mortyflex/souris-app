// BeautIzzy — Accueil header
//
// The brand row (`HomeBrandRow`): the editorial BeautIzzy logo and — ONLY
// while the session's verification confirms a BeautIzzy Plus entitlement in
// force — the small « Plus » mark beside it. In every other state the logo is
// alone: no date, no text, no ornament; the greeting lives in its own card
// below (HomeGreetingCard).
//
// The decision follows `useBusinessAccess().verification` through THE rule
// `hasVerifiedPlusEntitlement` — never the effective permission (with
// enforcement disabled every account has full access), never a store read,
// never a test-bench override: the preview draws the row with its own
// explicit flag and this header never reads it.

import { useBusinessAccess } from '@/features/access/session/BusinessAccessProvider';
import { hasVerifiedPlusEntitlement } from '@/features/access/status/subscription-status-presentation';

import { HomeBrandRow } from './HomeBrandRow';

export { HOME_LOGO_SIZE } from './HomeBrandRow';

interface HomeHeaderProps {
  /** Injected for deterministic tests; the application uses the system clock. */
  readonly clock?: () => Date;
}

const defaultClock = () => new Date();

export function HomeHeader({ clock = defaultClock }: HomeHeaderProps) {
  const { verification } = useBusinessAccess();
  return <HomeBrandRow showPlus={hasVerifiedPlusEntitlement(verification, clock())} />;
}
