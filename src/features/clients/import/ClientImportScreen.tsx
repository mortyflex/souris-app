// BeautIzzy — « Importer ma clientèle »
//
// The permanent client import flow, pushed from Clientèle inside the
// authenticated, Business-bound `(app)` group only:
//
//   source → paste | CSV file → review (edit, reclassify) → confirm
//          → chunked import → result
//
// (the source choice would be skipped with a single enabled source)
//
// Both sources end in the SAME staging (`stage`): from the review on, nothing
// knows where the candidates came from. The CSV file is read in memory through
// the system picker (shared/lib/file-acquisition) and parsed by the domain
// adapter; the reader never writes anything.
//
// Staging stays in THIS component's memory: the pasted text, the candidates,
// the choices. Nothing of it is persisted, logged or sent anywhere; leaving
// the screen forgets it. Only confirmed Clients are written, through the
// Client session (`addClients` → one transaction per chunk, each Client with
// its CLIENT outbox entry). Sync is the existing runner's business, like for
// every other mutation: it pushes the pending CLIENT entries at its next
// trigger (foreground tick, app foreground, launch). No screen triggers sync
// (CLOUD_SYNC.md), so the result shows at once, offline included.
//
// Leaving a review that holds analysed candidates — the back button, the
// native back gesture, hardware back — always asks first (« Quitter l'import
// ? »), the canonical discard dialog: the staging is memory-only by design, so
// it would be lost. The source choice and the result leave freely; the paste
// and CSV steps go back to the source choice; while an import runs, leaving is
// simply blocked.
//
// Confirmation first re-classifies the batch against the Clients STORED
// right now (sync may have brought some in): if that changes the selection,
// the review refreshes and asks for a second look instead of importing.

import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { Client } from '@/domain/clients';
import {
  classifyClientImportCandidates,
  findCriticalClientImportColumns,
  parseClientImportCsv,
  parseClientImportText,
  toImportedClient,
  type ClientImportCandidate,
  type ClientImportParseResult,
} from '@/domain/clients/import';
import { createClientId } from '@/features/clients/creation/runtime-ids';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { loadClients } from '@/persistence/stores/clients';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { usePersistence } from '@/providers/PersistenceProvider';
import { pickFileBytes } from '@/shared/lib/file-acquisition';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { Screen } from '@/shared/ui/Screen';
import { semanticColors, spacing } from '@/shared/ui/theme';

import { ClientImportCandidateSheet } from './components/ClientImportCandidateSheet';
import { ClientImportCsvStep } from './components/ClientImportCsvStep';
import { ClientImportHeader } from './components/ClientImportHeader';
import { ClientImportPasteStep } from './components/ClientImportPasteStep';
import { ClientImportResult } from './components/ClientImportResult';
import { ClientImportReviewStep } from './components/ClientImportReviewStep';
import {
  ClientImportSourceStep,
  ENABLED_CLIENT_IMPORT_SOURCES,
  type ClientImportSourceKey,
} from './components/ClientImportSourceStep';
import { csvProblemMessage, type ClientImportCsvProblem } from './presentation';
import {
  countBySegment,
  hasSameSelection,
  selectedCandidates,
  withChoice,
  withoutChoice,
  type ClientImportChoices,
  type ClientImportSegment,
} from './review-selection';
import { runClientImport, type ClientImportFailureCode } from './run-client-import';

type Step = 'source' | 'paste' | 'csv' | 'review' | 'importing' | 'result';

const SOURCE_STEPS: Record<ClientImportSourceKey, Step> = { PASTE: 'paste', CSV: 'csv' };

/**
 * The source choice is a step only while several sources are enabled; with a
 * single one, the import opens straight on it and back leaves the import.
 */
const SHOWS_SOURCE_CHOICE = ENABLED_CLIENT_IMPORT_SOURCES.length > 1;
const INITIAL_STEP: Step = SHOWS_SOURCE_CHOICE
  ? 'source'
  : SOURCE_STEPS[ENABLED_CLIENT_IMPORT_SOURCES[0] ?? 'PASTE'];

/** What the system picker offers: CSV under the types the platforms give it, and plain text. */
const CSV_MIME_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'text/tab-separated-values',
  'text/plain',
  'application/csv',
];
/** Far above any address book (≈ 100 000 rows); a larger file is not a client list. */
const CSV_MAX_BYTES = 10 * 1024 * 1024;

interface ImportProgress {
  /** Clients confirmed for this import (every attempt included). */
  readonly total: number;
  /** Clients whose chunk committed. */
  readonly completed: number;
  /** Those Clients as written (final corrected values), for the result summary — memory only. */
  readonly imported: readonly Client[];
  /** Not written yet — the SAME ids are retried by « Réessayer ». */
  readonly remaining: readonly Client[];
  readonly failure?: ClientImportFailureCode;
}

const NO_CHOICES: ClientImportChoices = new Map();

export function ClientImportScreen() {
  const router = useRouter();
  const { database } = usePersistence();
  const { clients, addClients } = useClientSession();

  const [step, setStep] = useState<Step>(INITIAL_STEP);
  const [text, setText] = useState('');
  const [nothingDetected, setNothingDetected] = useState(false);
  const [csvProblem, setCsvProblem] = useState<{
    readonly problem: ClientImportCsvProblem;
    readonly lineNumber?: number;
  }>();
  const [csvPicking, setCsvPicking] = useState(false);
  // Bumped when the CSV step is left: a file still being read is then forgotten.
  const csvRequest = useRef(0);
  const [candidates, setCandidates] = useState<readonly ClientImportCandidate[]>([]);
  const [ignoredColumns, setIgnoredColumns] = useState<readonly string[]>([]);
  const [unreadLines, setUnreadLines] = useState<readonly string[]>([]);
  const [choices, setChoices] = useState<ClientImportChoices>(NO_CHOICES);
  const [segment, setSegment] = useState<ClientImportSegment>('NEW');
  const [editingKey, setEditingKey] = useState<string>();
  // The stored Clients read at a confirmation that changed the selection.
  const [storedClients, setStoredClients] = useState<readonly Client[]>();
  const [progress, setProgress] = useState<ImportProgress>();

  const existingClients = storedClients ?? clients;
  const classified = useMemo(
    () => classifyClientImportCandidates(candidates, existingClients),
    [candidates, existingClients],
  );
  const selectedCount = selectedCandidates(classified, choices).length;
  // Ignored columns holding client data: nothing is imported while any exists.
  const criticalColumns = useMemo(() => findCriticalClientImportColumns(ignoredColumns), [ignoredColumns]);
  const editing = candidates.find((candidate) => candidate.key === editingKey);

  const [discardRequested, setDiscardRequested] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const hasStagedReview = step === 'review' && candidates.length > 0;

  // An import in flight is never abandoned halfway (blocked, no dialog); a
  // staged review is never abandoned without a confirmation.
  usePreventRemove(step === 'importing' || (hasStagedReview && !isLeaving), () => {
    if (step !== 'importing') setDiscardRequested(true);
  });

  useEffect(() => {
    if (isLeaving) router.back();
  }, [isLeaving, router]);

  // The same rule as the native gesture: a staged review asks first.
  const back = () => {
    if (hasStagedReview) setDiscardRequested(true);
    else if ((step === 'paste' || step === 'csv') && SHOWS_SOURCE_CHOICE) {
      csvRequest.current += 1;
      setCsvPicking(false);
      setCsvProblem(undefined);
      setStep('source');
    } else router.back();
  };

  /** The one entry of the review, whatever the source produced the candidates. */
  const stage = (result: ClientImportParseResult) => {
    const counts = countBySegment(classifyClientImportCandidates(result.candidates, clients));
    setCandidates(result.candidates);
    setIgnoredColumns(result.ignoredColumns);
    setUnreadLines(result.unreadLines);
    setChoices(NO_CHOICES);
    setStoredClients(undefined);
    setSegment(counts.NEW > 0 ? 'NEW' : counts.TO_FIX > 0 ? 'TO_FIX' : 'DUPLICATES');
    setStep('review');
  };

  const analyze = () => {
    const result = parseClientImportText(text, 'PASTE');
    if (result.candidates.length === 0) {
      setNothingDetected(true);
      return;
    }
    setNothingDetected(false);
    stage(result);
  };

  const pickCsvFile = async () => {
    if (csvPicking) return;
    const request = (csvRequest.current += 1);
    setCsvPicking(true);
    const picked = await pickFileBytes({ mimeTypes: CSV_MIME_TYPES, maxBytes: CSV_MAX_BYTES });
    if (request !== csvRequest.current) return;
    setCsvPicking(false);
    // A cancelled picker changes nothing: the step and its last message stay.
    if (picked.status === 'cancelled') return;
    if (picked.status !== 'selected') {
      setCsvProblem({ problem: picked.status === 'too-large' ? 'TOO_LARGE' : 'UNREADABLE' });
      return;
    }
    const result = parseClientImportCsv(picked.bytes);
    if (result.status === 'UNUSABLE') {
      setCsvProblem({
        problem: result.reason,
        ...(result.lineNumber !== undefined ? { lineNumber: result.lineNumber } : {}),
      });
    } else if (result.candidates.length === 0) setCsvProblem({ problem: 'NO_CLIENT' });
    else {
      setCsvProblem(undefined);
      stage(result);
    }
  };

  const selectSource = (source: ClientImportSourceKey) => {
    setStep(SOURCE_STEPS[source]);
    // The picker opens at once; the CSV step is what a cancel or an unusable file comes back to.
    if (source === 'CSV') void pickCsvFile();
  };

  const saveEdit = (edited: ClientImportCandidate) => {
    setCandidates((current) =>
      current.map((candidate) => (candidate.key === edited.key ? edited : candidate)),
    );
    setChoices((current) => withoutChoice(current, edited.key));
    setEditingKey(undefined);
  };

  const importClients = async (
    plan: readonly Client[],
    alreadyImported: readonly Client[],
    total: number,
  ) => {
    const alreadyCompleted = alreadyImported.length;
    setStep('importing');
    setProgress({ total, completed: alreadyCompleted, imported: alreadyImported, remaining: plan });
    const outcome = await runClientImport(plan, addClients, {
      onProgress: (completed) =>
        setProgress({
          total,
          completed: alreadyCompleted + completed,
          imported: alreadyImported,
          remaining: plan.slice(completed),
        }),
    });
    setProgress({
      total,
      completed: alreadyCompleted + outcome.completed.length,
      imported: [...alreadyImported, ...outcome.completed],
      remaining: outcome.remaining,
      ...(outcome.failure ? { failure: outcome.failure } : {}),
    });
    setStep('result');
    if (outcome.failure) haptics.warning();
    else haptics.success();
  };

  const confirm = () => {
    if (criticalColumns.length > 0) return;
    let stored: readonly Client[];
    try {
      stored = loadClients(database);
    } catch (error) {
      alertPersistenceFailure(error);
      return;
    }
    const fresh = classifyClientImportCandidates(candidates, stored);
    if (!hasSameSelection(classified, fresh, choices)) {
      setStoredClients(stored);
      return;
    }
    const plan = selectedCandidates(fresh, choices).map((entry) =>
      toImportedClient(entry.candidate, createClientId()),
    );
    void importClients(plan, [], plan.length);
  };

  const retry = () => {
    if (!progress) return;
    void importClients(progress.remaining, progress.imported, progress.total);
  };

  return (
    <Screen
      header={
        <ClientImportHeader
          backDisabled={step === 'importing'}
          onBack={back}
          title="Importer ma clientèle"
        />
      }
      testID="client-import-screen"
    >
      {step === 'source' && <ClientImportSourceStep onSelect={selectSource} />}
      {step === 'csv' && (
        <ClientImportCsvStep
          onPickFile={() => void pickCsvFile()}
          picking={csvPicking}
          {...(csvProblem ? { error: csvProblemMessage(csvProblem.problem, csvProblem.lineNumber) } : {})}
        />
      )}
      {step === 'paste' && (
        <ClientImportPasteStep
          nothingDetected={nothingDetected}
          onAnalyze={analyze}
          onChangeText={(next) => {
            setText(next);
            setNothingDetected(false);
          }}
          text={text}
        />
      )}
      {step === 'review' && (
        <ClientImportReviewStep
          choices={choices}
          classified={classified}
          existingClients={existingClients}
          criticalColumns={criticalColumns}
          ignoredColumns={ignoredColumns}
          onChoice={(key, selected) => setChoices((current) => withChoice(current, key, selected))}
          onEdit={setEditingKey}
          onImport={confirm}
          onSegmentChange={setSegment}
          refreshed={storedClients !== undefined}
          segment={segment}
          selectedCount={selectedCount}
          unreadLines={unreadLines}
        />
      )}
      {step === 'importing' && progress && (
        <View accessibilityLiveRegion="polite" style={styles.centered} testID="client-import-progress">
          <ActivityIndicator color={semanticColors.accent} />
          <AppText variant="stateTitle">Import en cours…</AppText>
          <AppText variant="metadata">{`${progress.completed} / ${progress.total}`}</AppText>
        </View>
      )}
      {step === 'result' && progress && (
        <ClientImportResult
          failedCount={progress.remaining.length}
          imported={progress.imported}
          onDone={() => router.back()}
          onRetry={retry}
          {...(progress.failure ? { failure: progress.failure } : {})}
        />
      )}
      <ConfirmationDialog
        body="Les informations analysées et vos corrections seront perdues."
        cancelLabel="Continuer l’import"
        cancelTestID="client-import-keep"
        confirmLabel="Quitter"
        confirmTestID="client-import-discard"
        onCancel={() => setDiscardRequested(false)}
        onConfirm={() => {
          setDiscardRequested(false);
          setIsLeaving(true);
        }}
        testID="client-import-discard-dialog"
        title="Quitter l’import ?"
        visible={discardRequested}
      />
      <ClientImportCandidateSheet
        candidate={step === 'review' ? editing : undefined}
        onClose={() => setEditingKey(undefined)}
        onSave={saveEdit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center' },
});
