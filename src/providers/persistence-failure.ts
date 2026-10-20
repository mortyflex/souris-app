// BeautIzzy — recoverable persistence failure feedback
//
// A write that reaches the database and fails leaves React state untouched
// (providers update state only after a successful write). Screens report
// the failure with this one concise alert instead of crashing the handler.
//
// THE connection point of the read-only experience (BeautIzzy Plus). A
// mutation refused by the write guard throws `BusinessAccessDeniedError`
// and reaches the same catch sites as any other refused write; given the
// error, this alert explains the subscription access instead of a misleading
// "could not be saved": the domain's reason, worded by `read-only-copy.ts`,
// then what reading still allows. Every other error — or no error at all —
// keeps the generic alert exactly as before. Nothing is swallowed: the
// mutation already changed nothing, and nothing reads as a successful save.
//
// No « Découvrir BeautIzzy Plus » action yet: it needs the account-scoped
// paywall routing of a later phase to lead somewhere real.

import { Alert } from 'react-native';

import { describeBusinessAccessDenial } from '@/features/access/read-only-copy';
import { isBusinessAccessDeniedError } from '@/features/access/write-guard';

export const PERSISTENCE_FAILURE_TITLE = 'Enregistrement impossible';
export const PERSISTENCE_FAILURE_MESSAGE = 'Les données n’ont pas pu être enregistrées. Réessayez.';

export function alertPersistenceFailure(error?: unknown): void {
  if (isBusinessAccessDeniedError(error)) {
    const { title, message } = describeBusinessAccessDenial(error.reason);
    Alert.alert(title, message);
    return;
  }
  Alert.alert(PERSISTENCE_FAILURE_TITLE, PERSISTENCE_FAILURE_MESSAGE);
}
