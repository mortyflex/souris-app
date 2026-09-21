// Souris — DaySummaryTicket
//
// « Résumé du jour » of the day the Agenda is showing: reads the sessions,
// asks the domain for the day summary, words it, and hands the receipt to the
// printer. Every figure comes from `getAppointmentDaySummary`; nothing is
// computed or stored here. Calendar Blocks are never an input.

import { getAppointmentDaySummary } from '@/domain/appointments';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';

import { DaySummaryReceipt } from './DaySummaryReceipt';
import { ReceiptPrinter } from './ReceiptPrinter';
import { buildDaySummaryReceipt } from './day-summary-receipt';

interface DaySummaryTicketProps {
  readonly visible: boolean;
  /** The day selected in the Agenda — not necessarily today. */
  readonly day: Date;
  readonly onClose: () => void;
}

export function DaySummaryTicket({ visible, day, onClose }: DaySummaryTicketProps) {
  const { appointments } = useAppointmentSession();
  const { sales } = useSaleSession();
  const { getClientById } = useClientSession();

  return (
    <ReceiptPrinter
      backdropLabel="Fermer le résumé du jour"
      onClose={onClose}
      renderReceipt={({ width, maxHeight }) => {
        const summary = getAppointmentDaySummary(
          { appointments: appointments.map((entry) => entry.appointment), sales },
          day,
        );
        const model = buildDaySummaryReceipt(summary, day, (clientId) =>
          getResolvedClientDisplayName(getClientById(clientId)),
        );
        return <DaySummaryReceipt maxHeight={maxHeight} model={model} width={width} />;
      }}
      testID="day-summary"
      visible={visible}
    />
  );
}
