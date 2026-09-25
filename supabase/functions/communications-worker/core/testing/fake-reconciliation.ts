// Souris — in-memory reconciliation retry queue (tests only)
//
// The contract of the Lot B hardening RPCs, deterministic and offline: jobs
// are claimed once per pass, `runReconciliation` succeeds or throws per a
// scripted outcome, and settlements record what the worker decided.

import type {
  ClaimedReconciliationJob,
  ReconciliationRetryQueue,
  ReconciliationScope,
} from '../reconciliation.ts';

interface FakeJobInput {
  readonly id: string;
  readonly businessId?: string;
  readonly scopeType?: ReconciliationScope;
  readonly sourceId?: string;
  readonly attemptCount?: number;
  /** Throws this error from runReconciliation; success otherwise. */
  readonly failWith?: Error;
}

interface Settlement {
  readonly id: string;
  readonly outcome: 'COMPLETED' | 'RETRY' | 'PARKED';
  readonly error?: string;
  readonly delaySeconds?: number;
  readonly claimedUpdatedAt: string;
}

export class FakeReconciliationRetryQueue implements ReconciliationRetryQueue {
  private pending: { job: ClaimedReconciliationJob; failWith?: Error }[] = [];
  readonly runs: ClaimedReconciliationJob[] = [];
  readonly settlements: Settlement[] = [];

  addJob(input: FakeJobInput): void {
    this.pending.push({
      job: {
        id: input.id,
        businessId: input.businessId ?? 'biz-1',
        scopeType: input.scopeType ?? 'APPOINTMENT',
        sourceId: input.sourceId ?? (input.scopeType === 'BUSINESS' ? '' : `apt-${input.id}`),
        attemptCount: input.attemptCount ?? 1,
        claimedUpdatedAt: `claim-${input.id}`,
      },
      failWith: input.failWith,
    });
  }

  async claimJobs(): Promise<readonly ClaimedReconciliationJob[]> {
    const claimed = this.pending;
    this.pending = [];
    return claimed.map((entry) => entry.job);
  }

  async runReconciliation(job: ClaimedReconciliationJob): Promise<void> {
    this.runs.push(job);
    const scripted = this.scriptedFailure.get(job.id);
    if (scripted) throw scripted;
  }

  private readonly scriptedFailure = new Map<string, Error>();

  scriptFailure(id: string, error: Error): void {
    this.scriptedFailure.set(id, error);
  }

  async completeJob(id: string, claimedUpdatedAt: string): Promise<void> {
    this.settlements.push({ id, outcome: 'COMPLETED', claimedUpdatedAt });
  }

  async failJob(
    id: string,
    error: string,
    delaySeconds: number | null,
    claimedUpdatedAt: string,
  ): Promise<void> {
    this.settlements.push(
      delaySeconds === null
        ? { id, outcome: 'PARKED', error, claimedUpdatedAt }
        : { id, outcome: 'RETRY', error, delaySeconds, claimedUpdatedAt },
    );
  }
}
