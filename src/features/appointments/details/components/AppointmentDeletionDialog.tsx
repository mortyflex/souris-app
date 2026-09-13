// Souris — permanent Appointment deletion dialog
//
// Deletion is different from cancellation and no-show: it removes the
// record from the Agenda and from the Client history. Two shapes on the
// shared Souris confirmation dialog, never both:
//
//   confirm  → irreversible confirmation (Retour / Supprimer)
//   blocked  → concise explanation: a recorded checkout or a linked Product
//              Sale anchors the Appointment in business history. No
//              destructive control, no cascade option.

import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';

export type AppointmentDeletionDialogMode = 'confirm' | 'blocked';

interface AppointmentDeletionDialogProps {
  readonly mode: AppointmentDeletionDialogMode | undefined;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function AppointmentDeletionDialog({ mode, onClose, onConfirm }: AppointmentDeletionDialogProps) {
  if (mode === 'blocked') {
    return (
      <ConfirmationDialog
        body="Ce rendez-vous possède un encaissement enregistré ou une vente de produits associée. Conservez-le pour préserver l’historique de caisse."
        cancelLabel="Compris"
        cancelTestID="close-appointment-deletion-blocked"
        eyebrow="SUPPRESSION"
        onCancel={onClose}
        testID="appointment-deletion-blocked"
        title="Suppression impossible"
        tone="neutral"
        visible
      />
    );
  }

  return (
    <ConfirmationDialog
      body="Il sera supprimé de l’agenda et de l’historique de la cliente. Cette action est irréversible."
      cancelLabel="Retour"
      cancelTestID="cancel-permanent-deletion"
      confirmLabel="Supprimer"
      confirmTestID="confirm-permanent-deletion"
      eyebrow="SUPPRESSION"
      onCancel={onClose}
      onConfirm={onConfirm}
      testID="permanent-deletion-dialog"
      title="Supprimer ce rendez-vous ?"
      visible={mode === 'confirm'}
    />
  );
}
