// BeautIzzy — BusinessInsightsTicket
//
// « Tops & tendances », printed by the SAME receipt printer as « Résumé du
// jour ». Opens on the MONTH of the date the Agenda is showing (not the real
// today), then owns its own browsing state — period kind and anchor — for as
// long as it is open: browsing never moves the Agenda, and every opening
// starts again from the Agenda date.
//
// Every figure comes from `getBusinessInsights` over the canonical sessions,
// read in one pass; nothing is stored. Calendar Blocks are never an input.
//
// Enregistrer / Partager (next to « Fermer »): the paper words the share
// model of what is on screen — the browsed period and the settled carousel
// category, with the same podium as the ticket — from the insights it already
// computed. The ticket keeps that ONE card mounted off screen; both actions
// capture it:
//
//   Partager     the native share sheet. It reports no outcome: nothing is
//                confirmed when it closes.
//   Enregistrer  straight to Photos (add-only permission). The ONLY flow that
//                confirms a save: « Image enregistrée dans Photos » and one
//                success haptic, once the library has the image.
//
// One action at a time: every press is ignored while one is working. A failure
// shows one retryable line; nothing closes the ticket, and the browsed period
// and category never move.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'react-native';

import {
  getBusinessInsights,
  getInsightsPeriod,
  shiftInsightsAnchor,
  type InsightsPeriodKind,
} from '@/domain/insights';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { haptics } from '@/shared/lib/haptics';
import { PhotosPermissionError, saveViewToPhotos, shareViewAsImage } from '@/shared/lib/share-image';
import { glassIcons } from '@/shared/ui/GlassIconButton';
import { ImageExportFrame } from '@/shared/ui/ImageExportFrame';
import { ReceiptPrinter, type ReceiptPaperFrame } from '@/shared/ui/ReceiptPrinter';

import { BusinessInsightsReceipt } from './BusinessInsightsReceipt';
import {
  BusinessInsightsShareCard,
  INSIGHTS_SHARE_BACKGROUND,
  INSIGHTS_SHARE_CARD_SIZE,
  INSIGHTS_SHARE_IMAGE_SIZE,
} from './BusinessInsightsShareCard';
import {
  buildInsightsReceipt,
  formatInsightsPeriod,
  getInsightsNavigationLabels,
  type InsightsRankingKey,
} from './insights-receipt';
import { buildInsightsShareCard, type InsightsShareCardModel } from './insights-share-card';

interface BusinessInsightsTicketProps {
  readonly visible: boolean;
  /** The day selected in the Agenda when the ticket opens. */
  readonly anchor: Date;
  readonly onClose: () => void;
}

type ExportAction = 'share' | 'save';

export const INSIGHTS_SHARE_ERROR = 'Impossible de préparer le partage.';
export const INSIGHTS_SAVED = 'Image enregistrée dans Photos';
export const INSIGHTS_SAVE_ERROR = 'Impossible d’enregistrer l’image.';
export const INSIGHTS_SAVE_PERMISSION_ERROR =
  'BeautIzzy n’a pas accès à Photos. Autorisez-le dans Réglages pour enregistrer l’image.';
/** How long the save confirmation stays before it quietly goes away (ms). */
export const INSIGHTS_SAVED_NOTICE_DURATION = 2600;

export function BusinessInsightsTicket({ visible, anchor, onClose }: BusinessInsightsTicketProps) {
  const [shareCard, setShareCard] = useState<InsightsShareCardModel | null>(null);
  const [working, setWorking] = useState<ExportAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const exportFrame = useRef<View>(null);
  const busy = useRef(false);

  // A notice belongs to one opening: closing the ticket forgets it.
  if (!visible && notice !== null) setNotice(null);

  // The save confirmation is light: it goes away on its own.
  useEffect(() => {
    if (notice !== INSIGHTS_SAVED) return;
    const hide = setTimeout(() => setNotice(null), INSIGHTS_SAVED_NOTICE_DURATION);
    return () => clearTimeout(hide);
  }, [notice]);

  const run = async (action: ExportAction) => {
    if (busy.current || shareCard === null) return;
    busy.current = true;
    setWorking(action);
    setNotice(null);
    try {
      if (action === 'share') {
        haptics.action();
        await shareViewAsImage(exportFrame, INSIGHTS_SHARE_IMAGE_SIZE, 'Partager les Tops et tendances');
      } else {
        await saveViewToPhotos(exportFrame, INSIGHTS_SHARE_IMAGE_SIZE);
        haptics.success();
        setNotice(INSIGHTS_SAVED);
      }
    } catch (error) {
      setNotice(
        action === 'share'
          ? INSIGHTS_SHARE_ERROR
          : error instanceof PhotosPermissionError
            ? INSIGHTS_SAVE_PERMISSION_ERROR
            : INSIGHTS_SAVE_ERROR,
      );
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  return (
    <ReceiptPrinter
      actionNotice={notice ?? undefined}
      actions={[
        {
          icon: glassIcons.saveImage,
          accessibilityLabel: 'Enregistrer l’image',
          onPress: () => void run('save'),
          busy: working === 'save',
          disabled: working !== null,
          testID: 'business-insights-save',
        },
        {
          icon: glassIcons.share,
          accessibilityLabel: 'Partager',
          onPress: () => void run('share'),
          busy: working === 'share',
          disabled: working !== null,
          testID: 'business-insights-share',
        },
      ]}
      backdropLabel="Fermer les tops et tendances"
      offstage={
        shareCard === null ? undefined : (
          <ImageExportFrame
            backgroundColor={INSIGHTS_SHARE_BACKGROUND}
            layoutSize={INSIGHTS_SHARE_CARD_SIZE}
            ref={exportFrame}
            testID="business-insights-share-frame"
          >
            <BusinessInsightsShareCard model={shareCard} testID="business-insights-share-card" />
          </ImageExportFrame>
        )
      }
      onClose={onClose}
      renderReceipt={(frame) => (
        <BusinessInsightsPaper anchor={anchor} frame={frame} onShareCardChange={setShareCard} />
      )}
      testID="business-insights"
      visible={visible}
    />
  );
}

/** Mounted only while the printer presents it: its state starts over at each opening. */
function BusinessInsightsPaper({
  anchor,
  frame,
  onShareCardChange,
}: {
  readonly anchor: Date;
  readonly frame: ReceiptPaperFrame;
  readonly onShareCardChange: (card: InsightsShareCardModel | null) => void;
}) {
  const { appointments, deposits } = useAppointmentSession();
  const { sales } = useSaleSession();
  const { getClientById } = useClientSession();
  const [kind, setKind] = useState<InsightsPeriodKind>('MONTH');
  const [periodAnchor, setPeriodAnchor] = useState(
    () => new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()),
  );
  const [category, setCategory] = useState<InsightsRankingKey>('services');

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
  const periodLabel = formatInsightsPeriod(period);

  // The share card follows what is on screen; it goes away with the paper.
  const shareCard = useMemo(
    () => buildInsightsShareCard(insights, periodLabel, category, getClientById),
    [insights, periodLabel, category, getClientById],
  );
  useEffect(() => {
    onShareCardChange(shareCard);
    return () => onShareCardChange(null);
  }, [shareCard, onShareCardChange]);

  return (
    <BusinessInsightsReceipt
      model={model}
      nextLabel={navigation.next}
      onCategoryChange={setCategory}
      onNext={() => setPeriodAnchor((current) => shiftInsightsAnchor(kind, current, 1))}
      onPeriodKindChange={setKind}
      onPrevious={() => setPeriodAnchor((current) => shiftInsightsAnchor(kind, current, -1))}
      periodKind={kind}
      periodLabel={periodLabel}
      previousLabel={navigation.previous}
      width={frame.width}
    />
  );
}
