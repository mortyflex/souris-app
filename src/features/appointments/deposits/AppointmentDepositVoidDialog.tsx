// Souris — « Annuler l'acompte » confirmation
//
// Voiding CORRECTS a mistaken entry: it is not a refund, and the wording says
// so. The deposit stays in the Appointment history as « Annulé » and stops
// counting in the Appointment and in the Caisse. To correct an amount: void,
// then take a new deposit — an existing deposit is never edited.
//
// On a CANCELLED or NO_SHOW Appointment the correction is the ONLY financial
// action left (no new deposit can be taken), and the risk of reading it as a
// refund is highest — the visit did not happen. The wording is then explicit
// about both: it corrects an entry, it gives no money back.

import { canCorrectAppointmentDeposits, type Appointment, type AppointmentDeposit } from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';

interface AppointmentDepositVoidDialogProps {
  /** The deposit to void; undefined hides the dialog. */
  readonly deposit: AppointmentDeposit | undefined;
  /** Status of its Appointment: a cancelled or missed visit is worded explicitly. */
  readonly appointmentStatus: Appointment['status'];
  readonly onClose: () => void;
  readonly onConfirm: (deposit: AppointmentDeposit) => void;
}

const OPEN_BODY =
  'Cet acompte ne sera plus compté dans le rendez-vous ni dans la caisse. Il reste visible comme acompte annulé. Il s’agit d’une correction de saisie, pas d’un remboursement.';

const EXCEPTION_BODY =
  'Cette action corrige un acompte enregistré par erreur. Elle ne rembourse pas le client. L’acompte ne sera plus compté dans le rendez-vous ni dans les totaux de la caisse, et reste visible comme acompte annulé.';

export function AppointmentDepositVoidDialog({
  deposit,
  appointmentStatus,
  onClose,
  onConfirm,
}: AppointmentDepositVoidDialogProps) {
  // CANCELLED / NO_SHOW: the visit did not happen — say what this does and
  // does not do. COMPLETED never reaches here (frozen, `canCorrect…` is false).
  const isException =
    appointmentStatus === 'CANCELLED' || appointmentStatus === 'NO_SHOW';

  return (
    <ConfirmationDialog
      body={isException ? EXCEPTION_BODY : OPEN_BODY}
      cancelLabel="Retour"
      cancelTestID="cancel-void-deposit"
      confirmLabel="Annuler l’acompte"
      confirmTestID="confirm-void-deposit"
      eyebrow="ACOMPTE"
      onCancel={onClose}
      onConfirm={() => {
        if (deposit) onConfirm(deposit);
      }}
      testID="void-deposit-dialog"
      title={
        isException
          ? 'Annuler cet acompte ?'
          : deposit
            ? `Annuler l’acompte de ${formatEuroCents(deposit.amountCents)} ?`
            : 'Annuler l’acompte ?'
      }
      visible={deposit !== undefined && canCorrectAppointmentDeposits({ status: appointmentStatus })}
    />
  );
}
