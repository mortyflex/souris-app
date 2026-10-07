// BeautIzzy — WeekSummaryTicket
//
// « Résumé de la semaine » of the week the Agenda is showing — the SAME seven
// local days as Week mode (`getWeekDays`: Monday → Sunday of the selected day).
// Reads the sessions at print time, asks the domain for the period summary and
// activity, words them, and hands the receipt to the same printer and paper as
// « Résumé du jour ». Nothing is computed or stored here; Calendar Blocks are
// never an input.

import { getAppointmentPeriodActivity, getAppointmentPeriodSummary } from '@/domain/appointments';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { ReceiptPrinter } from '@/shared/ui/ReceiptPrinter';

import { getWeekDays } from '../calendar/week';
import { DaySummaryReceipt } from './DaySummaryReceipt';
import { buildWeekSummaryReceipt } from './week-summary-receipt';

interface WeekSummaryTicketProps {
  readonly visible: boolean;
  /** Any day of the week the Agenda is showing. */
  readonly day: Date;
  readonly onClose: () => void;
}

export function WeekSummaryTicket({ visible, day, onClose }: WeekSummaryTicketProps) {
  const { appointments, deposits } = useAppointmentSession();
  const { sales } = useSaleSession();

  return (
    <ReceiptPrinter
      backdropLabel="Fermer le résumé de la semaine"
      onClose={onClose}
      renderReceipt={({ width, maxHeight }) => {
        const weekDays = getWeekDays(day);
        const period = { firstDay: weekDays[0], lastDay: weekDays[6] };
        const sessionAppointments = appointments.map((entry) => entry.appointment);
        const summary = getAppointmentPeriodSummary(
          { appointments: sessionAppointments, sales, deposits },
          period,
        );
        const activity = getAppointmentPeriodActivity(sessionAppointments, period);
        const model = buildWeekSummaryReceipt(summary, activity, period.firstDay);
        return (
          <DaySummaryReceipt maxHeight={maxHeight} model={model} testID="week-summary" width={width} />
        );
      }}
      testID="week-summary"
      visible={visible}
    />
  );
}
