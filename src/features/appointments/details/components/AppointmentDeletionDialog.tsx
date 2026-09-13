// Souris — permanent Appointment deletion dialog
//
// Deletion is different from cancellation and no-show: it removes the
// record from the Agenda and from the Client history. The wording is owned
// here; the surface is the shared Souris confirmation dialog.

import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';

interface AppointmentDeletionDialogProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function AppointmentDeletionDialog({
  visible,
  onClose,
  onConfirm,
}: AppointmentDeletionDialogProps) {
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
      visible={visible}
    />
  );
}
