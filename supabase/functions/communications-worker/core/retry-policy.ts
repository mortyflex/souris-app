// Souris — Communication Core: the ONE retry policy
//
// Every retry constant lives here. The worker asks this module what to do
// after a retryable failure; the database only receives the resulting delay
// (communications_mark_retry applies it to DATABASE time, so no worker clock
// ever decides when a record is due).

export interface RetryPolicy {
  /** Total attempts, first delivery attempt included. */
  readonly maxAttempts: number;
  /** Delay after attempt n = delaysSeconds[n - 1] (the last entry repeats). */
  readonly delaysSeconds: readonly number[];
}

/**
 * attempt 1 fails (retryable) → retry in 1 minute
 * attempt 2 fails (retryable) → retry in 5 minutes
 * attempt 3 fails (retryable) → retry in 15 minutes
 * attempt 4 fails             → FAILED
 */
export const COMMUNICATION_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  delaysSeconds: [60, 300, 900],
};

export type RetryDecision =
  | { readonly kind: 'RETRY'; readonly delaySeconds: number }
  | { readonly kind: 'FAIL' };

/** What to do after attempt number `attemptCount` failed with a retryable error. */
export function decideAfterRetryableFailure(
  policy: RetryPolicy,
  attemptCount: number,
): RetryDecision {
  const attempt = Math.max(1, Math.floor(attemptCount));
  if (attempt >= policy.maxAttempts) {
    return { kind: 'FAIL' };
  }
  const index = Math.min(attempt - 1, policy.delaysSeconds.length - 1);
  return { kind: 'RETRY', delaySeconds: policy.delaysSeconds[index] };
}
