// Souris — permanent Client deletion dialog
//
// Reached only from an ARCHIVED Client profile, after the database-backed
// eligibility check. Two shapes on the shared Souris confirmation dialog,
// never both:
//
//   confirm  → irreversible confirmation (Retour / Supprimer)
//   blocked  → concise explanation: history exists, keep the Client
//              archived. No destructive control, no cascade option.

import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';

export type ClientDeletionDialogMode = 'confirm' | 'blocked';

interface ClientDeletionDialogProps {
  readonly mode: ClientDeletionDialogMode | undefined;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function ClientDeletionDialog({ mode, onClose, onConfirm }: ClientDeletionDialogProps) {
  if (mode === 'blocked') {
    return (
      <ConfirmationDialog
        body="Cette cliente possède un historique de rendez-vous ou de ventes. Conservez-la archivée pour préserver cet historique."
        cancelLabel="Compris"
        cancelTestID="close-client-deletion-blocked"
        eyebrow="SUPPRESSION"
        onCancel={onClose}
        testID="client-deletion-blocked"
        title="Suppression impossible"
        tone="neutral"
        visible
      />
    );
  }

  return (
    <ConfirmationDialog
      body="Cette action est irréversible."
      cancelLabel="Retour"
      cancelTestID="cancel-client-deletion"
      confirmLabel="Supprimer"
      confirmTestID="confirm-client-deletion"
      eyebrow="SUPPRESSION"
      onCancel={onClose}
      onConfirm={onConfirm}
      testID="client-deletion-dialog"
      title="Supprimer définitivement cette cliente ?"
      visible={mode === 'confirm'}
    />
  );
}
