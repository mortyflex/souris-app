// BeautIzzy — Plus reconciliation: an in-memory run control for tests
//
// Reproduces the contract of the subscription_reconciliation_* functions:
// one run row per claim with its counts and bounded report, a lease per
// account in APPLY mode only, recently reconciled and backed-off accounts
// skipped, ordered continuation, every lease released at finish.

import type { AccountReport, AccountToReconcile } from '../account-reconciliation.ts';
import type { ClaimedBatch, FinishedRun, ReconciliationControl, RunRequest, RunStatus } from '../run.ts';

export interface FakeRun {
  readonly id: string;
  readonly request: RunRequest;
  status: 'RUNNING' | RunStatus;
  readonly counts: Record<string, number>;
  requests: number;
  readonly report: { userId: string; outcome: string; detail: string | null }[];
  lastError: string | null;
}

export interface FakeAccountState {
  leaseRunId: string | null;
  lastSucceededAtMs: number | null;
  lastOutcome: string | null;
  consecutiveFailures: number;
  nextAttemptAtMs: number | null;
}

export class FakeReconciliationControl implements ReconciliationControl {
  /** Every account the scope could select, in the order the database would list them. */
  readonly accounts: AccountToReconcile[] = [];
  readonly runs: FakeRun[] = [];
  readonly states = new Map<string, FakeAccountState>();
  /** When set, the next `settle` rejects with it (a database failure). */
  failNextSettle: Error | undefined;
  nowMs = 0;
  private sequence = 0;

  addAccount(account: AccountToReconcile): void {
    this.accounts.push(account);
  }

  state(userId: string): FakeAccountState {
    let state = this.states.get(userId);
    if (state === undefined) {
      state = { leaseRunId: null, lastSucceededAtMs: null, lastOutcome: null, consecutiveFailures: 0, nextAttemptAtMs: null };
      this.states.set(userId, state);
    }
    return state;
  }

  async claim(request: RunRequest, _leaseSeconds: number): Promise<ClaimedBatch> {
    const explicit = 'users' in request.scope;
    const unknownUsers: string[] = [];
    let candidates: AccountToReconcile[];
    if ('users' in request.scope) {
      candidates = [];
      for (const id of request.scope.users) {
        const account = this.accounts.find((entry) => entry.userId === id);
        if (account === undefined) unknownUsers.push(id);
        else candidates.push(account);
      }
    } else {
      const source = request.scope.source;
      candidates = this.accounts.filter((account) => (source === 'mirrored' ? account.mirrorRows > 0 : account.businessId !== null));
    }
    candidates = candidates.filter((account) => request.after === null || account.userId > request.after);
    const skipped = { leased: 0, recent: 0, backoff: 0 };
    const eligible = candidates.filter((account) => {
      const state = this.states.get(account.userId);
      if (state?.leaseRunId) {
        skipped.leased += 1;
        return false;
      }
      if (state?.lastSucceededAtMs !== null && state?.lastSucceededAtMs !== undefined && state.lastSucceededAtMs > this.nowMs - request.minAgeSeconds * 1000) {
        skipped.recent += 1;
        return false;
      }
      if (!explicit && state?.nextAttemptAtMs !== null && state?.nextAttemptAtMs !== undefined && state.nextAttemptAtMs > this.nowMs) {
        skipped.backoff += 1;
        return false;
      }
      return true;
    });
    const selected = [...eligible].sort((a, b) => a.userId.localeCompare(b.userId)).slice(0, request.limit);
    this.sequence += 1;
    const run: FakeRun = { id: `run-${this.sequence}`, request, status: 'RUNNING', counts: {}, requests: 0, report: [], lastError: null };
    this.runs.push(run);
    if (request.mode === 'APPLY') for (const account of selected) this.state(account.userId).leaseRunId = run.id;
    return {
      runId: run.id,
      accounts: selected,
      unknownUsers,
      skipped,
      eligible: eligible.length,
      nextCursor: request.kind !== 'SWEEP' && eligible.length > request.limit ? selected[selected.length - 1].userId : null,
    };
  }

  async settle(runId: string, report: AccountReport): Promise<void> {
    if (this.failNextSettle !== undefined) {
      const error = this.failNextSettle;
      this.failNextSettle = undefined;
      throw error;
    }
    const run = this.runs.find((entry) => entry.id === runId);
    if (run === undefined || run.status !== 'RUNNING') throw new Error('subscription reconciliation: run is not running');
    run.counts[report.outcome] = (run.counts[report.outcome] ?? 0) + 1;
    run.requests += report.requests;
    run.report.push({ userId: report.userId, outcome: report.outcome, detail: report.detail });
    if (run.request.mode === 'APPLY') {
      const state = this.state(report.userId);
      state.leaseRunId = null;
      state.lastOutcome = report.outcome;
      if (report.outcome === 'FAILED') {
        state.consecutiveFailures += 1;
        state.nextAttemptAtMs = this.nowMs + Math.min(15 * 60_000 * 2 ** Math.min(state.consecutiveFailures - 1, 7), 24 * 3_600_000);
      } else {
        state.consecutiveFailures = 0;
        state.nextAttemptAtMs = null;
        state.lastSucceededAtMs = this.nowMs;
      }
    }
  }

  async finish(runId: string, status: RunStatus, error: string | null): Promise<FinishedRun> {
    const run = this.runs.find((entry) => entry.id === runId);
    if (run === undefined || run.status !== 'RUNNING') throw new Error('subscription reconciliation: run is not running');
    run.status = status;
    run.lastError = error;
    for (const state of this.states.values()) if (state.leaseRunId === runId) state.leaseRunId = null;
    return { runId, status, selected: run.report.length, counts: { ...run.counts }, requests: run.requests, cursorUserId: null, lastError: error };
  }
}
