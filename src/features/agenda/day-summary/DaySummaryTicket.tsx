// BeautIzzy — DaySummaryTicket
//
// « Résumé du jour » of the day the Agenda is showing: reads the sessions,
// asks the domain for the day summary, words it, and hands the receipt to the
// printer. Every figure comes from `getAppointmentDaySummary` and, for
// « Encaissements du jour », from the Caisse selection of the same local day
// (`getCashRegisterPeriodBreakdown`) — its « Total encaissé » IS the Caisse
// total of that day, product sales and refunds included. Nothing is computed
// or stored here, nothing is cached: the paper follows the sessions while it
// is open (a sale, a refund, a pulled change). Deposits are an input —
// « Déjà encaissé » counts the deposits of the day's Appointments whatever
// day they were paid. Calendar Blocks are never an input.

import { getAppointmentDaySummary } from '@/domain/appointments';
import { getCashRegisterDayInterval, getCashRegisterPeriodBreakdown } from '@/domain/cash-register';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { ReceiptPrinter } from '@/shared/ui/ReceiptPrinter';

import { DaySummaryReceipt } from './DaySummaryReceipt';
import { buildDaySummaryReceipt } from './day-summary-receipt';

interface DaySummaryTicketProps {
  readonly visible: boolean;
  /** The day selected in the Agenda — not necessarily today. */
  readonly day: Date;
  readonly onClose: () => void;
}

export function DaySummaryTicket({ visible, day, onClose }: DaySummaryTicketProps) {
  const { appointments, deposits } = useAppointmentSession();
  const { sales, saleAdjustments } = useSaleSession();
  const { getClientById } = useClientSession();

  return (
    <ReceiptPrinter
      backdropLabel="Fermer le résumé du jour"
      onClose={onClose}
      renderReceipt={({ width }) => {
        const sources = { appointments: appointments.map((entry) => entry.appointment), sales, deposits };
        const summary = getAppointmentDaySummary(sources, day);
        const encashment = getCashRegisterPeriodBreakdown(
          { ...sources, saleAdjustments },
          getCashRegisterDayInterval(day),
        );
        const model = buildDaySummaryReceipt(
          summary,
          day,
          (clientId) => getResolvedClientDisplayName(getClientById(clientId)),
          encashment,
        );
        return <DaySummaryReceipt model={model} width={width} />;
      }}
      testID="day-summary"
      visible={visible}
    />
  );
}
