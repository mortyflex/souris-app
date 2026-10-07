// BeautIzzy — EstimationDocument
//
// The generated « Estimation tarifaire », in the visual language of the
// « Tops & tendances » share card (DESIGN_OVERRIDES.md §35, §37): a
// shareable BeautIzzy document rather than an administrative form — yet
// structurally simple, with no analytics.
//
//   header    the BeautIzzy mark (56 pt, restrained) · « ESTIMATION TARIFAIRE »
//             eyebrow in accent · Business name in plum (screenTitle) ·
//             generation date
//   tear line the dashed ReceiptTearLine of the share card
//   services  « Prestations » · one calm line per Service: name ↔ price, a
//             subtle hairline between lines; a long name wraps, never cut
//   total     the shared lavender highlight panel: « Total estimé » eyebrow
//             over the amount, large and plum — the focal point
//   note      the indicative disclaimer, secondary
//   footer    the shared « Créé avec » + BeautIzzy wordmark
//
// BeautIzzy tokens only: no gradient, no chart, no client, no validity, no tax.
// It renders the model as is and computes nothing. It is the INTERIOR only,
// with no surface of its own — the two presentations bring theirs, exactly
// as « Tops & tendances » does (EstimationTicket):
//
//   printer   inside `ReceiptPaper`, the torn-edge ticket of the printer
//   export    inside `ShareCardCanvas`, the shared full-bleed share canvas;
//             `fixedTypography` then pins every text size so the image never
//             depends on the device text size
//
// No height is fixed anywhere: a long estimation is simply taller. When the
// surface is taller than the content (the 9:16 share canvas), the footer
// settles at its bottom edge, like the « Tops & tendances » card.

import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { CreatedWithBeautIzzy } from '@/shared/ui/CreatedWithBeautIzzy';
import { ReceiptTearLine } from '@/shared/ui/ReceiptPaper';
import { ShareHighlightPanel } from '@/shared/ui/ShareHighlightPanel';
import { foregroundSoft, semanticColors, spacing } from '@/shared/ui/theme';

import type { EstimationDocumentModel } from './estimation-document';

interface EstimationDocumentProps {
  readonly model: EstimationDocumentModel;
  /** Export surface: text never scales with the device setting. */
  readonly fixedTypography?: boolean;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly testID?: string;
}

export function EstimationDocument({
  model,
  fixedTypography = false,
  onLayout,
  testID = 'estimation-document',
}: EstimationDocumentProps) {
  const text = fixedTypography ? { allowFontScaling: false } : {};

  return (
    <View onLayout={onLayout} style={styles.document} testID={testID}>
      <View style={styles.header}>
        <BrandMark decorative size={25} variant="symbol" />
        <AppText {...text} style={styles.kicker} testID={`${testID}-title`} variant="eyebrow">
          {model.title}
        </AppText>
        <AppText
          {...text}
          style={styles.business}
          testID={`${testID}-business`}
          variant="screenTitle"
        >
          {model.businessName}
        </AppText>
        <AppText {...text} style={styles.soft} testID={`${testID}-date`} variant="metadata">
          {model.dateLabel}
        </AppText>
      </View>

      <ReceiptTearLine style={styles.tearLine} />

      <AppText {...text} accessibilityRole="header" style={styles.sectionTitle} variant="rowTitle">
        Prestations
      </AppText>
      <View testID={`${testID}-lines`}>
        {model.lines.map((line, index) => (
          <View
            accessible
            accessibilityLabel={line.accessibilityLabel}
            key={line.key}
            style={[styles.line, index > 0 && styles.lineSeparated]}
            testID={`${testID}-line-${index}`}
          >
            <AppText {...text} style={styles.lineLabel} variant="body">
              {line.label}
            </AppText>
            <AppText {...text} style={styles.linePrice} variant="control">
              {line.price}
            </AppText>
          </View>
        ))}
      </View>

      <ShareHighlightPanel
        accessibilityLabel={`${model.totalLabel}, ${model.total}`}
        accessible
        style={styles.total}
        testID={`${testID}-total`}
      >
        <AppText {...text} style={styles.totalLabel} variant="eyebrow">
          {model.totalLabel}
        </AppText>
        <AppText
          {...text}
          style={styles.totalValue}
          testID={`${testID}-total-value`}
          variant="display"
        >
          {model.total}
        </AppText>
      </ShareHighlightPanel>

      <AppText {...text} style={styles.disclaimer} testID={`${testID}-disclaimer`} variant="metadata">
        {model.disclaimer}
      </AppText>

      {/* Takes whatever room a taller surface leaves: the footer sits at its bottom. */}
      <View style={styles.spacer} />

      <CreatedWithBeautIzzy
        allowFontScaling={fixedTypography ? false : undefined}
        style={styles.footer}
        testID={`${testID}-branding`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No surface, no margins: the ticket or the share canvas brings them.
  document: { flexGrow: 1 },
  spacer: { flexGrow: 1 },
  header: { alignItems: 'center' },
  kicker: { color: semanticColors.accent, marginTop: spacing.xs, textAlign: 'center' },
  business: { color: semanticColors.brandForeground, marginTop: 2, textAlign: 'center' },
  soft: { color: foregroundSoft, marginTop: 2, textAlign: 'center' },
  tearLine: { marginVertical: spacing.lg },
  sectionTitle: { color: semanticColors.brandForeground, marginBottom: spacing.xs },
  line: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  lineSeparated: {
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lineLabel: { color: semanticColors.foreground, flex: 1 },
  linePrice: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  total: { gap: spacing.xs, marginTop: spacing.lg, paddingVertical: spacing.base },
  totalLabel: { color: semanticColors.accent, textAlign: 'center' },
  totalValue: {
    color: semanticColors.brandForeground,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  disclaimer: { color: foregroundSoft, marginTop: spacing.base, textAlign: 'center' },
  footer: { marginTop: spacing.xl },
});
