// Souris — BusinessInsightsShareCard
//
// The shareable visual of « Tops & tendances »: a 9:16 story card of the period
// and the category being browsed, exported as an image (DESIGN_OVERRIDES.md
// §35). It is its own composition, never a capture of the private receipt:
// no controls, no carousel, no printer, no dimmed Agenda — only the card.
//
//   top      the Souris mark (restrained) · « TOPS & TENDANCES » · the period
//   summary  lavender panel: « ENCAISSÉ SUR LA PÉRIODE » over a frosted
//            private amount · « 28 rendez-vous » ↔ « Panier moyen » and its
//            frosted private amount — turnover is never printed on a public
//            image, but the reader sees it exists
//   tear line
//   highlight  the podium of the category on screen, as the ticket shows it
//            (prestations, produits, clientes) · a calm line (empty period)
//   footer   « Créé avec » + the Souris wordmark
//
// The professional's result, powered by Souris: the brand frames the card,
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
import { ReceiptTearLine } from '@/shared/ui/ReceiptPaper';
import {
  foregroundSoft,
  lavender,
  radii,
  receiptPaper,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { InsightsPodium } from './components/InsightsPodium';
import type { InsightsShareCardModel, InsightsShareHighlight } from './insights-share-card';

/** Logical layout of the card (dp): a 9:16 story. */
export const INSIGHTS_SHARE_CARD_SIZE = { width: 360, height: 640 } as const;
/** The exported image (px): the same 9:16 at story resolution. */
export const INSIGHTS_SHARE_IMAGE_SIZE = { width: 1080, height: 1920 } as const;
/** The full-bleed ground of the whole image. */
export const INSIGHTS_SHARE_BACKGROUND = receiptPaper.surface;

const FIXED = { allowFontScaling: false } as const;

interface BusinessInsightsShareCardProps {
  readonly model: InsightsShareCardModel;
  readonly testID?: string;
}

export function BusinessInsightsShareCard({ model, testID }: BusinessInsightsShareCardProps) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <BrandMark decorative size={56} variant="mark" />
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

      <View style={styles.summary}>
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
      </View>

      <ReceiptTearLine />

      <View style={styles.highlight} testID={testID ? `${testID}-highlight` : undefined}>
        <Highlight highlight={model.highlight} />
      </View>

      <View style={styles.footer}>
        <AppText {...FIXED} style={styles.footerText} variant="metadata">
          Créé avec
        </AppText>
        <BrandMark decorative size={64} variant="wordmark" />
      </View>
    </View>
  );
}

/**
 * A private amount: a frosted lilac capsule holding soft digit-shaped marks
 * and a readable `€`. The shape never depends on the value — no number is
 * ever rendered, so nothing can be read back from the image.
 */
function PrivateAmount({ size, testID }: { readonly size: 'large' | 'small'; readonly testID?: string }) {
  const large = size === 'large';
  const marks = large ? [18, 18, 18, 18] : [9, 9, 9];
  return (
    <View style={[styles.private, large ? styles.privateLarge : styles.privateSmall]} testID={testID}>
      {marks.map((width, index) => (
        <View
          key={index}
          style={[styles.privateMark, large ? styles.privateMarkLarge : styles.privateMarkSmall, { width }]}
        />
      ))}
      <AppText {...FIXED} style={styles.privateCurrency} variant={large ? 'sectionTitle' : 'metadata'}>
        €
      </AppText>
    </View>
  );
}

function Highlight({ highlight }: { readonly highlight: InsightsShareHighlight }) {
  switch (highlight.kind) {
    case 'ranking':
      return <InsightsPodium allowFontScaling={false} layout="story" section={highlight.section} />;
    case 'calm':
      return (
        <AppText {...FIXED} style={styles.calm} variant="sectionTitle">
          {highlight.message}
        </AppText>
      );
  }
}

const styles = StyleSheet.create({
  // Flat warm paper, full-bleed: no radius, no frame, no other ground.
  card: {
    backgroundColor: INSIGHTS_SHARE_BACKGROUND,
    height: INSIGHTS_SHARE_CARD_SIZE.height,
    paddingBottom: spacing['3xl'] + spacing.base,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'] + spacing.lg,
    width: INSIGHTS_SHARE_CARD_SIZE.width,
  },
  header: { alignItems: 'center' },
  kicker: { color: semanticColors.accent, marginTop: spacing.xs },
  period: { color: semanticColors.brandForeground, marginTop: 2, textAlign: 'center' },
  summary: {
    alignItems: 'center',
    backgroundColor: lavender.lav050,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  totalLabel: { color: semanticColors.accent },
  // Frosted private amount: soft lilac, no border, no gradient.
  private: {
    alignItems: 'center',
    backgroundColor: lavender.lav100,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    flexDirection: 'row',
  },
  privateLarge: { gap: 6, height: 40, marginTop: spacing.xs, paddingHorizontal: spacing.base },
  privateSmall: { gap: 3, height: 20, paddingHorizontal: spacing.sm },
  privateMark: { backgroundColor: lavender.lav200, borderRadius: radii.pill },
  privateMarkLarge: { height: 14 },
  privateMarkSmall: { height: 7 },
  privateCurrency: { color: semanticColors.accent, marginLeft: 2, opacity: 0.8 },
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
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    opacity: 0.85,
  },
  footerText: { color: foregroundSoft },
});
