// The run control and the access reader bound to the RPCs: exact function
// names and arguments, strict answer mapping, errors naming the function only.

import type { AccountReport } from '../account-reconciliation';
import { asClaimedBatch, asFinishedRun, createSupabasePlusAccessReader, createSupabaseReconciliationControl } from '../supabase-control';

const USER = '6f1d2c3b-4a5e-4f60-8a71-9b2c3d4e5f60';

function client(answers: Record<string, unknown | Error>) {
  const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];
  return {
    calls,
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      const answer = answers[fn];
      if (answer instanceof Error) return { data: null, error: { message: answer.message } };
      return { data: answer, error: null };
    },
  };
}

const report: AccountReport = { userId: USER, outcome: 'APPLIED', detail: null, requests: 2, accessBefore: false, accessAfter: true, changes: [], unlisted: [], failure: null };

describe('Supabase reconciliation control', () => {
  it('claims through subscription_reconciliation_claim with the exact arguments and maps the batch', async () => {
    const c = client({
      subscription_reconciliation_claim: {
        run_id: 'run-1',
        users: [{ user_id: USER, business_id: 'biz', app_user_ids: ['alias-1', USER], mirror_rows: 2, plus_access: true }],
        unknown_users: ['nope'],
        skipped: { leased: 1, recent: 2, backoff: 3 },
        eligible: 7,
        next_cursor: USER,
      },
    });
    const control = createSupabaseReconciliationControl(c);
    const batch = await control.claim({ kind: 'BACKFILL', mode: 'APPLY', scope: { users: [USER] }, limit: 10, after: null, minAgeSeconds: 60 }, 300);
    expect(c.calls).toEqual([{ fn: 'subscription_reconciliation_claim', args: { p_kind: 'BACKFILL', p_mode: 'APPLY', p_scope: { users: [USER] }, p_limit: 10, p_after: null, p_min_age_seconds: 60, p_lease_seconds: 300 } }]);
    expect(batch).toEqual({
      runId: 'run-1',
      accounts: [{ userId: USER, businessId: 'biz', appUserIds: [USER, 'alias-1'], mirrorRows: 2, plusAccess: true }],
      unknownUsers: ['nope'],
      skipped: { leased: 1, recent: 2, backoff: 3 },
      eligible: 7,
      nextCursor: USER,
    });
    await control.claim({ kind: 'SWEEP', mode: 'DRY_RUN', scope: { source: 'mirrored' }, limit: 20, after: null, minAgeSeconds: 0 }, 120);
    expect(c.calls[1].args).toMatchObject({ p_kind: 'SWEEP', p_mode: 'DRY_RUN', p_scope: { source: 'mirrored' }, p_lease_seconds: 120 });
  });

  it('settles through subscription_reconciliation_settle and finishes through subscription_reconciliation_finish', async () => {
    const c = client({
      subscription_reconciliation_settle: { status: 'SETTLED' },
      subscription_reconciliation_finish: { run_id: 'run-1', status: 'STOPPED', selected: 3, counts: { APPLIED: 1, FAILED: 1 }, requests: 4, cursor_user_id: null, last_error: 'rate-limited' },
    });
    const control = createSupabaseReconciliationControl(c);
    await control.settle('run-1', report);
    expect(c.calls[0]).toEqual({ fn: 'subscription_reconciliation_settle', args: { p_run_id: 'run-1', p_user_id: USER, p_outcome: 'APPLIED', p_detail: null, p_requests: 2 } });
    await expect(control.finish('run-1', 'STOPPED', 'rate-limited')).resolves.toEqual({ runId: 'run-1', status: 'STOPPED', selected: 3, counts: { APPLIED: 1, FAILED: 1 }, requests: 4, cursorUserId: null, lastError: 'rate-limited' });
    expect(c.calls[1]).toEqual({ fn: 'subscription_reconciliation_finish', args: { p_run_id: 'run-1', p_status: 'STOPPED', p_error: 'rate-limited' } });
  });

  it('rejects a database error with the function name, and a malformed answer with a message naming no payload', async () => {
    const failing = createSupabaseReconciliationControl(client({ subscription_reconciliation_claim: new Error('permission denied for function') }));
    await expect(failing.claim({ kind: 'SWEEP', mode: 'DRY_RUN', scope: { source: 'mirrored' }, limit: 1, after: null, minAgeSeconds: 0 }, 60)).rejects.toThrow('subscription reconciliation: subscription_reconciliation_claim failed: permission denied for function');
    expect(() => asClaimedBatch(null)).toThrow('answered no object');
    expect(() => asClaimedBatch({ users: [] })).toThrow('answered no run id');
    expect(() => asClaimedBatch({ run_id: 'r', users: [{ plus_access: true }] })).toThrow('without user id');
    expect(asClaimedBatch({ run_id: 'r' })).toEqual({ runId: 'r', accounts: [], unknownUsers: [], skipped: { leased: 0, recent: 0, backoff: 0 }, eligible: 0, nextCursor: null });
    expect(() => asFinishedRun({ run_id: 'r', status: 'RUNNING' })).toThrow('unknown status');
  });

  it('asks THE access rule through subscription_has_plus_access and accepts a boolean only', async () => {
    const c = client({ subscription_has_plus_access: true });
    await expect(createSupabasePlusAccessReader(c).hasPlusAccess(USER)).resolves.toBe(true);
    expect(c.calls).toEqual([{ fn: 'subscription_has_plus_access', args: { p_user_id: USER } }]);
    await expect(createSupabasePlusAccessReader(client({ subscription_has_plus_access: 'yes' })).hasPlusAccess(USER)).rejects.toThrow('answered no boolean');
    await expect(createSupabasePlusAccessReader(client({ subscription_has_plus_access: new Error('42501') })).hasPlusAccess(USER)).rejects.toThrow('subscription_has_plus_access failed: 42501');
  });
});
