// Souris — recoverable persistence failure feedback
//
// A write that reaches the database and fails leaves React state untouched
// (providers update state only after a successful write). Screens report
// the failure with this one concise alert instead of crashing the handler.

import { Alert } from 'react-native';

export function alertPersistenceFailure(): void {
  Alert.alert(
    'Enregistrement impossible',
    'Les données n’ont pas pu être enregistrées. Réessayez.',
  );
}
