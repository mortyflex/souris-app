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
// Client spending — ONE choice, the eye of « Clients qui dépensent le plus »,
// owned here and applied to BOTH the paper and the exported card: open eye,
// amounts written on screen AND in the image; crossed eye, masked on screen
// AND in the image. Every opening starts HIDDEN; the choice survives a client
// profile visit (the ticket steps aside, it does not close) and is forgotten
// on close. It is never persisted, so it can neither outlive the app nor
// reach another account. Masking happens in the models, so a hidden number
// is never rendered anywhere — not even off screen. An export is refused
// while the mounted card does not match the choice on screen (the card
// follows the paper one render later), and the eye ignores taps while an
// export is working, so a capture never sees a half-changed card. Business
// turnover stays frosted on the card whatever the choice (§35).
//
// One action at a time: every press is ignored while one is working. A failure
// shows one retryable line; nothing closes the ticket, and the browsed period
// and category never move.
//
// Client places open the client's profile (`/clients/[clientId]`, by the
// stable id the ranking row carries — never by name). A receipt lives in a
// Modal, which would cover a pushed screen, so the ticket STEPS ASIDE: the
// printer closes, the profile is pushed once the paper has left
// (`onDismissed`), and when this screen regains focus the ticket comes back
// as it was — same period kind, anchor and category — instead of starting
// over. Only a close requested by the screen (« Fermer », the dimmed page…)
// forgets the browsing; the next opening then starts again from the Agenda
// date. A place whose client no longer exists carries no id and opens nothing.

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type ClientSpendingVisibility,
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

/** What the paper is showing: remembered while a client profile is open, so the ticket comes back as it was. */
interface InsightsBrowsing {
  readonly kind: InsightsPeriodKind;
  readonly anchor: Date;
  readonly category: InsightsRankingKey;
}

export const INSIGHTS_SHARE_ERROR = 'Impossible de préparer le partage.';
export const INSIGHTS_SAVED = 'Image enregistrée dans Photos';
export const INSIGHTS_SAVE_ERROR = 'Impossible d’enregistrer l’image.';
export const INSIGHTS_SAVE_PERMISSION_ERROR =
  'BeautIzzy n’a pas accès à Photos. Autorisez-le dans Réglages pour enregistrer l’image.';
/** How long the save confirmation stays before it quietly goes away (ms). */
export const INSIGHTS_SAVED_NOTICE_DURATION = 2600;

export function BusinessInsightsTicket({ visible, anchor, onClose }: BusinessInsightsTicketProps) {
  const router = useRouter();
  const [shareCard, setShareCard] = useState<InsightsShareCardModel | null>(null);
  const [working, setWorking] = useState<ExportAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const exportFrame = useRef<View>(null);
  const busy = useRef(false);
  const [clientSpending, setClientSpending] = useState<ClientSpendingVisibility>('hidden');

  // Stepping aside for a client profile: the printer closes while `aside`, and
  // the paper reopens from `resumeFrom` when the screen regains focus.
  const [aside, setAside] = useState(false);
  const [resumeFrom, setResumeFrom] = useState<InsightsBrowsing | null>(null);
  const browsing = useRef<InsightsBrowsing | null>(null);
  const pendingClientId = useRef<string | null>(null);
  const returning = useRef(false);

  // A notice belongs to one opening: closing the ticket forgets it.
  if (!visible && notice !== null) setNotice(null);
  // So does the browsing: a close requested by the screen starts over next time.
  if (!visible && aside) setAside(false);
  if (!visible && resumeFrom !== null) setResumeFrom(null);
  // And so does the client-spending choice: every opening starts hidden.
  if (!visible && clientSpending !== 'hidden') setClientSpending('hidden');

  const toggleClientSpending = () => {
    // Never while an export works: the card it captures must not change under it.
    if (busy.current) return;
    haptics.selection();
    setClientSpending((current) => (current === 'visible' ? 'hidden' : 'visible'));
  };

  const openClient = (clientId: string) => {
    if (busy.current || pendingClientId.current !== null) return;
    pendingClientId.current = clientId;
    setNotice(null);
    setAside(true);
  };

  // The paper has left: push the profile, and come back on the next focus.
  const onDismissed = useCallback(() => {
    const clientId = pendingClientId.current;
    if (clientId === null) return;
    pendingClientId.current = null;
    returning.current = true;
    router.push({ pathname: '/clients/[clientId]', params: { clientId } });
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      if (!returning.current) return;
      returning.current = false;
      setResumeFrom(browsing.current);
      setAside(false);
    }, []),
  );

  const rememberBrowsing = useCallback((current: InsightsBrowsing) => {
    browsing.current = current;
  }, []);

  // The save confirmation is light: it goes away on its own.
  useEffect(() => {
    if (notice !== INSIGHTS_SAVED) return;
    const hide = setTimeout(() => setNotice(null), INSIGHTS_SAVED_NOTICE_DURATION);
    return () => clearTimeout(hide);
  }, [notice]);

  const run = async (action: ExportAction) => {
    if (busy.current || shareCard === null) return;
    // The card follows the paper one render later: never capture one worded
    // with another client-spending choice than the one on screen.
    if (shareCard.clientSpending !== clientSpending) return;
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
      onDismissed={onDismissed}
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
        <BusinessInsightsPaper
          anchor={anchor}
          clientSpending={clientSpending}
          frame={frame}
          initialBrowsing={resumeFrom ?? undefined}
          onBrowsingChange={rememberBrowsing}
          onClientSpendingToggle={toggleClientSpending}
          onOpenClient={openClient}
          onShareCardChange={setShareCard}
        />
      )}
      testID="business-insights"
      visible={visible && !aside}
    />
  );
}

/**
 * Mounted only while the printer presents it: its state starts over at each
 * opening — from the Agenda date, or from `initialBrowsing` when the ticket
 * comes back from a client profile.
 */
function BusinessInsightsPaper({
  anchor,
  clientSpending,
  frame,
  initialBrowsing,
  onBrowsingChange,
  onClientSpendingToggle,
  onOpenClient,
  onShareCardChange,
}: {
  readonly anchor: Date;
  readonly clientSpending: ClientSpendingVisibility;
  readonly frame: ReceiptPaperFrame;
  readonly initialBrowsing?: InsightsBrowsing;
  readonly onBrowsingChange: (browsing: InsightsBrowsing) => void;
  readonly onClientSpendingToggle: () => void;
  readonly onOpenClient: (clientId: string) => void;
  readonly onShareCardChange: (card: InsightsShareCardModel | null) => void;
}) {
  const { appointments, deposits } = useAppointmentSession();
  const { sales, saleAdjustments } = useSaleSession();
  const { getClientById } = useClientSession();
  const [kind, setKind] = useState<InsightsPeriodKind>(initialBrowsing?.kind ?? 'MONTH');
  const [periodAnchor, setPeriodAnchor] = useState(
    () => initialBrowsing?.anchor ?? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()),
  );
  const [category, setCategory] = useState<InsightsRankingKey>(initialBrowsing?.category ?? 'services');
  useEffect(() => {
    onBrowsingChange({ kind, anchor: periodAnchor, category });
  }, [kind, periodAnchor, category, onBrowsingChange]);

  const period = getInsightsPeriod(kind, periodAnchor);
  const insights = useMemo(
    () =>
      getBusinessInsights(
        { appointments: appointments.map((entry) => entry.appointment), sales, deposits, saleAdjustments },
        getInsightsPeriod(kind, periodAnchor),
      ),
    [appointments, sales, deposits, saleAdjustments, kind, periodAnchor],
  );
  const model = buildInsightsReceipt(insights, getClientById, clientSpending);
  const navigation = getInsightsNavigationLabels(kind);
  const periodLabel = formatInsightsPeriod(period);

  // The share card follows what is on screen; it goes away with the paper.
  const shareCard = useMemo(
    () => buildInsightsShareCard(insights, periodLabel, category, getClientById, clientSpending),
    [insights, periodLabel, category, getClientById, clientSpending],
  );
  useEffect(() => {
    onShareCardChange(shareCard);
    return () => onShareCardChange(null);
  }, [shareCard, onShareCardChange]);

  return (
    <BusinessInsightsReceipt
      clientSpending={clientSpending}
      initialCategory={initialBrowsing?.category}
      model={model}
      nextLabel={navigation.next}
      onCategoryChange={setCategory}
      onClientPress={onOpenClient}
      onClientSpendingToggle={onClientSpendingToggle}
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
