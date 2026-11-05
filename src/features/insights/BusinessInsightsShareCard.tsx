// BeautIzzy — BusinessInsightsShareCard
//
// The shareable visual of « Tops & tendances »: a 9:16 story card of the period
// and the category being browsed, exported as an image (DESIGN_OVERRIDES.md
// §35). It is its own composition, never a capture of the private receipt:
// no controls, no carousel, no printer, no dimmed Agenda — only the card.
//
//   top      the BeautIzzy mark (restrained) · « TOPS & TENDANCES » · the period
//   summary  lavender panel: « ENCAISSÉ SUR LA PÉRIODE » over a frosted
//            private amount · « 28 rendez-vous » ↔ « Panier moyen » and its
//            frosted private amount — turnover is never printed on a public
//            image, but the reader sees it exists
//   tear line
//   highlight  the podium of the category on screen, as the ticket shows it
//            (prestations, produits, clientes) · a calm line (empty period)
//   footer   « Créé avec » + the BeautIzzy wordmark (shared CreatedWithBeautIzzy)
//
// The professional's result, powered by BeautIzzy: the brand frames the card,
// the figures carry it. The warm paper runs full-bleed, edge to edge of the
// image; generous margins keep text clear of the areas social apps crop or
// cover.
//
// It renders a share model (`insights-share-card.ts`) as is: no storage, no
// session, no analytics, no knowledge of the carousel. Every text is laid out
// at a fixed size (`allowFontScaling={false}`), so the exported image is the
// same whatever the device text size.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { CreatedWithBeautIzzy } from '@/shared/ui/CreatedWithBeautIzzy';
import { ReceiptTearLine } from '@/shared/ui/ReceiptPaper';
import {
  SHARE_CARD_BACKGROUND,
  SHARE_CARD_SIZE,
  ShareCardCanvas,
  getShareImagePixelSize,
} from '@/shared/ui/ShareCardCanvas';
import { ShareHighlightPanel } from '@/shared/ui/ShareHighlightPanel';
import { foregroundSoft, lavender, semanticColors, spacing } from '@/shared/ui/theme';

import { InsightsPodium } from './components/InsightsPodium';
import { PrivateAmount } from './components/PrivateAmount';
import type { InsightsShareCardModel, InsightsShareHighlight } from './insights-share-card';

/** Logical layout of the card (dp): the shared 9:16 share canvas. */
export const INSIGHTS_SHARE_CARD_SIZE = SHARE_CARD_SIZE;
/** The exported image (px): the same 9:16 at story resolution. */
export const INSIGHTS_SHARE_IMAGE_SIZE = getShareImagePixelSize(SHARE_CARD_SIZE.height);
/** The full-bleed ground of the whole image. */
export const INSIGHTS_SHARE_BACKGROUND = SHARE_CARD_BACKGROUND;

const FIXED = { allowFontScaling: false } as const;

interface BusinessInsightsShareCardProps {
  readonly model: InsightsShareCardModel;
  readonly testID?: string;
}

export function BusinessInsightsShareCard({ model, testID }: BusinessInsightsShareCardProps) {
  return (
    <ShareCardCanvas testID={testID}>
      <View style={styles.header}>
        <BrandMark decorative size={25} variant="symbol" />
        <AppText {...FIXED} style={styles.kicker} variant="eyebrow">
          Tops & tendances
        </AppText>
        <AppText
          {...FIXED}
          numberOfLines={1}
          style={styles.period}
          testID={testID ? `${testID}-period` : undefined}
          variant="screenTitle"
        >
          {model.periodLabel}
        </AppText>
      </View>

      <ShareHighlightPanel style={styles.summary} testID={testID ? `${testID}-summary` : undefined}>
        <AppText {...FIXED} style={styles.totalLabel} variant="eyebrow">
          Encaissé sur la période
        </AppText>
        <PrivateAmount size="large" testID={testID ? `${testID}-cash` : undefined} />
        <View style={styles.metrics}>
          <AppText {...FIXED} style={styles.metric} variant="metadata">
            {model.completedAppointments}
          </AppText>
          <View style={styles.average}>
            <AppText {...FIXED} style={styles.metric} variant="metadata">
              Panier moyen
            </AppText>
            <PrivateAmount size="small" testID={testID ? `${testID}-average` : undefined} />
          </View>
        </View>
      </ShareHighlightPanel>

      <ReceiptTearLine />

      <View style={styles.highlight} testID={testID ? `${testID}-highlight` : undefined}>
        <Highlight highlight={model.highlight} testID={testID ? `${testID}-podium` : undefined} />
      </View>

      <CreatedWithBeautIzzy {...FIXED} testID={testID ? `${testID}-footer` : undefined} />
    </ShareCardCanvas>
  );
}

function Highlight({
  highlight,
  testID,
}: {
  readonly highlight: InsightsShareHighlight;
  readonly testID?: string;
}) {
  switch (highlight.kind) {
    case 'ranking':
      return <InsightsPodium allowFontScaling={false} layout="story" section={highlight.section} testID={testID} />;
    case 'calm':
      return (
        <AppText {...FIXED} style={styles.calm} variant="sectionTitle">
          {highlight.message}
        </AppText>
      );
  }
}

const styles = StyleSheet.create({
  header: { alignItems: 'center' },
  kicker: { color: semanticColors.accent, marginTop: spacing.xs },
  period: { color: lavender.lav700, marginTop: 2, textAlign: 'center' },
  summary: { marginTop: spacing.lg },
  totalLabel: { color: semanticColors.accent },
  metrics: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  metric: { color: foregroundSoft, flexShrink: 1 },
  average: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs + 2 },
  // The highlight takes the room left between the summary and the footer,
  // centred in it — raised by its bottom padding, so the podium stays close
  // to the summary: a short podium and a tall one sit at the same optical place.
  highlight: { flex: 1, justifyContent: 'center', paddingBottom: spacing.xl },
  calm: { color: foregroundSoft, textAlign: 'center' },
});
