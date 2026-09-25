import {
  COMMUNICATION_RETRY_POLICY,
  decideAfterRetryableFailure,
} from '../retry-policy';

describe('communication retry policy', () => {
  it('is the documented deterministic policy: 1, 5, 15 minutes, then failed', () => {
    expect(COMMUNICATION_RETRY_POLICY.maxAttempts).toBe(4);
    expect(COMMUNICATION_RETRY_POLICY.delaysSeconds).toEqual([60, 300, 900]);
  });

  it('retries after each attempt below the maximum, with the centralized delay', () => {
    expect(decideAfterRetryableFailure(COMMUNICATION_RETRY_POLICY, 1)).toEqual({
      kind: 'RETRY',
      delaySeconds: 60,
    });
    expect(decideAfterRetryableFailure(COMMUNICATION_RETRY_POLICY, 2)).toEqual({
      kind: 'RETRY',
      delaySeconds: 300,
    });
    expect(decideAfterRetryableFailure(COMMUNICATION_RETRY_POLICY, 3)).toEqual({
      kind: 'RETRY',
      delaySeconds: 900,
    });
  });

  it('fails at the maximum attempt and beyond', () => {
    expect(decideAfterRetryableFailure(COMMUNICATION_RETRY_POLICY, 4)).toEqual({
      kind: 'FAIL',
    });
    expect(decideAfterRetryableFailure(COMMUNICATION_RETRY_POLICY, 5)).toEqual({
      kind: 'FAIL',
    });
  });

  it('repeats the last delay when a policy has more attempts than delays', () => {
    const policy = { maxAttempts: 5, delaysSeconds: [60, 300] };
    expect(decideAfterRetryableFailure(policy, 3)).toEqual({
      kind: 'RETRY',
      delaySeconds: 300,
    });
    expect(decideAfterRetryableFailure(policy, 4)).toEqual({
      kind: 'RETRY',
      delaySeconds: 300,
    });
  });

  it('treats a malformed attempt count as the first attempt', () => {
    expect(decideAfterRetryableFailure(COMMUNICATION_RETRY_POLICY, 0)).toEqual({
      kind: 'RETRY',
      delaySeconds: 60,
    });
  });
});
