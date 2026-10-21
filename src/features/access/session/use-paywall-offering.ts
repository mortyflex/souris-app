// BeautIzzy — the paywall offering of the signed-in user (BeautIzzy Plus)
//
// ONE hook owning the loading lifecycle of a `PaywallOffering` for the
// screen that draws it: it asks the provider's `loadOffering` (the same
// source and identity as the verification; never a second SDK path) once per
// signed-in user — and again on `retry` — and holds an explicit state:
//
//   loading      a request is in flight for THIS user;
//   unavailable  no account, no store adapter, or the store did not answer;
//   available    what the store offers this user, as the adapter mapped it.
//
// Account isolation. A request is identified by the signed-in user id and
// the attempt; only the answer of the CURRENT request is ever shown, so
// another user — or nobody — reads a fresh state, never the previous user's
// plans, and the answer of an older request, of a request started for
// another user, or of a request still in flight when the hook unmounts, is
// dropped. The source guarantees on its side that an answer was produced for
// the requested identity (`getAppUserID` is checked on the chain), so a
// request for A can never surface as an offering for B.
//
// Nothing is fetched on a render: the effect runs when the user or the
// attempt changes. Nothing is purchased here, and nothing is persisted.

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/session/AuthProvider';

import { noAccountPaywallOffering, type PaywallOffering } from '../paywall/paywall-offering';
import { useBusinessAccess } from './BusinessAccessProvider';

export interface PaywallOfferingSession {
  readonly offering: PaywallOffering;
  /** Asks the store again for the signed-in user. */
  readonly retry: () => void;
}

/** The answer of one request: for which user, which attempt, and what the store said. */
interface OfferingAnswer {
  readonly userId: string;
  readonly attempt: number;
  readonly offering: PaywallOffering;
}

const LOADING: PaywallOffering = { status: 'loading' };

export function usePaywallOffering(): PaywallOfferingSession {
  const { state: auth } = useAuth();
  const userId = auth.status === 'authenticated' ? auth.user.id : undefined;
  const { loadOffering } = useBusinessAccess();

  const [answer, setAnswer] = useState<OfferingAnswer | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    const request = { userId, attempt };
    void loadOffering().then((offering) => {
      if (current) setAnswer({ ...request, offering });
    });
    return () => {
      current = false;
    };
  }, [userId, loadOffering, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  // Derived: nobody signed in reads no account; the current request without
  // its answer yet reads loading — never another request's answer.
  const answered = answer !== undefined && answer.userId === userId && answer.attempt === attempt;
  const offering: PaywallOffering =
    userId === undefined ? noAccountPaywallOffering : answered ? answer.offering : LOADING;

  return { offering, retry };
}
