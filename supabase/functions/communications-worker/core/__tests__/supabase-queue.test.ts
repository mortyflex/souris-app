// BeautIzzy — the Supabase queue adapter: the pre-dispatch gate binds to
// `communications_authorize_dispatch` and maps its answer fail-closed.

import {
  asDispatchAuthorization,
  createSupabaseCommunicationQueue,
  DISPATCH_AUTHORIZATION_PROBE_ID,
} from '../supabase-queue';

interface RpcCall {
  readonly fn: string;
  readonly args: Record<string, unknown> | undefined;
}

function createRpcClient(answers: Record<string, unknown>, failing?: string) {
  const calls: RpcCall[] = [];
  const client = {
    async rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === failing) {
        return { data: null, error: { message: 'function does not exist' } };
      }
      return { data: answers[fn] ?? null, error: null };
    },
  };
  return { client, calls };
}

describe('supabase queue — authorizeDispatch (Phase 6.5B)', () => {
  it('calls communications_authorize_dispatch with the record id and nothing else', async () => {
    const { client, calls } = createRpcClient({ communications_authorize_dispatch: { status: 'DISPATCH' } });
    const queue = createSupabaseCommunicationQueue(client);

    await expect(queue.authorizeDispatch('c-1')).resolves.toBe('DISPATCH');
    expect(calls).toEqual([{ fn: 'communications_authorize_dispatch', args: { p_id: 'c-1' } }]);
  });

  it('never calls the retired status re-read', async () => {
    const { client, calls } = createRpcClient({ communications_authorize_dispatch: { status: 'SUSPENDED' } });
    const queue = createSupabaseCommunicationQueue(client);

    await queue.authorizeDispatch('c-1');
    expect(calls.map((call) => call.fn)).not.toContain('communications_read_status');
  });

  it.each([
    [{ status: 'DISPATCH' }, 'DISPATCH'],
    [{ status: 'SUSPENDED' }, 'SUSPENDED'],
    [{ status: 'SKIPPED', communication_status: 'CANCELLED' }, 'SKIPPED'],
    [{ status: 'ABSENT' }, 'SKIPPED'],
    [{ status: 'SOMETHING_NEW' }, 'SKIPPED'],
    [{}, 'SKIPPED'],
    [null, 'SKIPPED'],
    ['DISPATCH', 'SKIPPED'],
    [['DISPATCH'], 'SKIPPED'],
  ])('maps %j to %s — only an explicit DISPATCH sends (fail-closed)', (answer, expected) => {
    expect(asDispatchAuthorization(answer)).toBe(expected);
  });

  it('a database error is surfaced, never swallowed into a dispatch', async () => {
    const { client } = createRpcClient({}, 'communications_authorize_dispatch');
    const queue = createSupabaseCommunicationQueue(client);

    await expect(queue.authorizeDispatch('c-1')).rejects.toThrow(
      'communications: communications_authorize_dispatch failed: function does not exist',
    );
  });

  it('claimDue still sends no arguments (batch size and lease stay SQL defaults)', async () => {
    const { client, calls } = createRpcClient({ communications_claim_due: [] });
    const queue = createSupabaseCommunicationQueue(client);

    await expect(queue.claimDue()).resolves.toEqual([]);
    expect(calls).toEqual([{ fn: 'communications_claim_due', args: undefined }]);
  });
});

describe('supabase queue — verifyDispatchAuthorization (deployment-order compatibility)', () => {
  it('probes communications_authorize_dispatch with the nil UUID — an id gen_random_uuid() can never produce — and accepts ABSENT only', async () => {
    const { client, calls } = createRpcClient({ communications_authorize_dispatch: { status: 'ABSENT' } });
    const queue = createSupabaseCommunicationQueue(client);

    await expect(queue.verifyDispatchAuthorization()).resolves.toBeUndefined();
    expect(DISPATCH_AUTHORIZATION_PROBE_ID).toBe('00000000-0000-0000-0000-000000000000');
    expect(calls).toEqual([{ fn: 'communications_authorize_dispatch', args: { p_id: DISPATCH_AUTHORIZATION_PROBE_ID } }]);
  });

  it('a missing function (PGRST202) rejects with the database message, and nothing else is called', async () => {
    const { client, calls } = createRpcClient({}, 'communications_authorize_dispatch');
    const queue = createSupabaseCommunicationQueue(client);

    await expect(queue.verifyDispatchAuthorization()).rejects.toThrow(
      'communications: communications_authorize_dispatch failed: function does not exist',
    );
    expect(calls.map((call) => call.fn)).toEqual(['communications_authorize_dispatch']);
  });

  it.each([
    [{ status: 'DISPATCH' }],
    [{ status: 'SUSPENDED' }],
    [{ status: 'SKIPPED', communication_status: 'CANCELLED' }],
    [{}],
    [null],
    ['ABSENT'],
  ])('an answer other than the ABSENT contract (%j) rejects: the probe never passes on a surprise', async (answer) => {
    const { client } = createRpcClient({ communications_authorize_dispatch: answer });
    const queue = createSupabaseCommunicationQueue(client);

    await expect(queue.verifyDispatchAuthorization()).rejects.toThrow(/to the probe instead of ABSENT/);
  });

  it('the probe is read-only by construction: it is the only call, and it names no settlement RPC', async () => {
    const { client, calls } = createRpcClient({ communications_authorize_dispatch: { status: 'ABSENT' } });
    const queue = createSupabaseCommunicationQueue(client);

    await queue.verifyDispatchAuthorization();
    expect(calls.map((call) => call.fn)).toEqual(['communications_authorize_dispatch']);
    expect(calls.some((call) => /mark_|claim_|cancel|enqueue|reschedule/.test(call.fn))).toBe(false);
  });
});
