// Souris — BusinessInsightsTicket
//
// « Tops & tendances », printed by the SAME receipt printer as « Résumé du
// jour ». Opens on the MONTH of the date the Agenda is showing (not the real
// today), then owns its own browsing state — period kind and anchor — for as
// long as it is open: browsing never moves the Agenda, and every opening
// starts again from the Agenda date.
//
// Every figure comes from `getBusinessInsights` over the canonical sessions,
// read in one pass; nothing is stored. Calendar Blocks are never an input.

import { useMemo, useState } from 'react';

import {
  getBusinessInsights,
  getInsightsPeriod,
  shiftInsightsAnchor,
  type InsightsPeriodKind,
} from '@/domain/insights';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { ReceiptPrinter, type ReceiptPaperFrame } from '@/shared/ui/ReceiptPrinter';

import { BusinessInsightsReceipt } from './BusinessInsightsReceipt';
import {
  buildInsightsReceipt,
  formatInsightsPeriod,
  getInsightsNavigationLabels,
} from './insights-receipt';

interface BusinessInsightsTicketProps {
  readonly visible: boolean;
  /** The day selected in the Agenda when the ticket opens. */
  readonly anchor: Date;
  readonly onClose: () => void;
}

export function BusinessInsightsTicket({ visible, anchor, onClose }: BusinessInsightsTicketProps) {
  return (
    <ReceiptPrinter
      backdropLabel="Fermer les tops et tendances"
      onClose={onClose}
      renderReceipt={(frame) => <BusinessInsightsPaper anchor={anchor} frame={frame} />}
      testID="business-insights"
      visible={visible}
    />
  );
}

/** Mounted only while the printer presents it: its state starts over at each opening. */
function BusinessInsightsPaper({
  anchor,
  frame,
}: {
  readonly anchor: Date;
  readonly frame: ReceiptPaperFrame;
}) {
  const { appointments, deposits } = useAppointmentSession();
  const { sales } = useSaleSession();
  const { getClientById } = useClientSession();
  const [kind, setKind] = useState<InsightsPeriodKind>('MONTH');
  const [periodAnchor, setPeriodAnchor] = useState(
    () => new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()),
  );

  const period = getInsightsPeriod(kind, periodAnchor);
  const insights = useMemo(
    () =>
      getBusinessInsights(
        { appointments: appointments.map((entry) => entry.appointment), sales, deposits },
        getInsightsPeriod(kind, periodAnchor),
      ),
    [appointments, sales, deposits, kind, periodAnchor],
  );
  const model = buildInsightsReceipt(insights, getClientById);
  const navigation = getInsightsNavigationLabels(kind);

  return (
    <BusinessInsightsReceipt
      maxHeight={frame.maxHeight}
      model={model}
      nextLabel={navigation.next}
      onNext={() => setPeriodAnchor((current) => shiftInsightsAnchor(kind, current, 1))}
      onPeriodKindChange={setKind}
      onPrevious={() => setPeriodAnchor((current) => shiftInsightsAnchor(kind, current, -1))}
      periodKind={kind}
      periodLabel={formatInsightsPeriod(period)}
      previousLabel={navigation.previous}
      width={frame.width}
    />
  );
}
