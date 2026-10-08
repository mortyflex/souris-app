// BeautIzzy — ReceiptPaper
//
// The paper of the BeautIzzy receipts (DESIGN_OVERRIDES.md §25): a warm
// near-white slip, FLAT (no grain, no texture, no gradient), square corners
// with torn top and bottom edges, lifted by one soft shadow. Content-agnostic:
// « Résumé du jour » and « Tops & tendances » each lay out their own lines
// inside it and separate their sections with `ReceiptTearLine`.
//
// The paper is as tall as its content, never bounded by the screen: on a short
// screen the printer scrolls the WHOLE paper (`ReceiptPrinter`), so the footer
// of a receipt always stays on the paper, above the torn bottom edge.

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { nativeShadows, receiptPaper, receiptPrinter, spacing } from './theme';

/**
 * Width (dp) of the closing signature of a receipt: the BeautIzzy SYMBOL alone
 * (`BrandMark variant="symbol"`), last on the paper, above the torn edge. The
 * paper is already BeautIzzy's: the wordmark is not repeated there.
 */
export const RECEIPT_SIGNATURE_SIZE = 24;

interface ReceiptPaperProps {
  readonly width: number;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function ReceiptPaper({ width, children, testID }: ReceiptPaperProps) {
  // The top teeth are drawn LAST, over the room kept for them here, so the
  // shadow of the paper never tints them.
  const topEdgeRoom = getToothWidth(width) / 2 - StyleSheet.hairlineWidth;

  return (
    <View style={{ paddingTop: topEdgeRoom, width }} testID={testID}>
      <View style={styles.paper}>{children}</View>
      <PaperEdge side="bottom" width={width} />
      <PaperEdge side="top" width={width} />
    </View>
  );
}

/**
 * A dashed tear line. Drawn as a clipped dashed box: a one-sided dashed border is not portable.
 * `style` may tighten its vertical margins on a denser receipt.
 */
export function ReceiptTearLine({ style }: { readonly style?: StyleProp<ViewStyle> } = {}) {
  return (
    <View style={[styles.tearLine, style]}>
      <View style={styles.tearLineDashes} />
    </View>
  );
}

function getToothCount(width: number): number {
  return Math.max(Math.floor(width / receiptPrinter.toothWidth), 1);
}

/** The teeth tile the paper width exactly, so their real width follows it. */
function getToothWidth(width: number): number {
  return width / getToothCount(width);
}

/**
 * The torn edge of the paper: a row of paper-coloured teeth. Each tooth is a
 * square turned 45°, centred on the edge of the paper and clipped to its outer
 * half, so the row tiles the width exactly whatever the device.
 */
function PaperEdge({ side, width }: { readonly side: 'top' | 'bottom'; readonly width: number }) {
  const count = getToothCount(width);
  const toothWidth = getToothWidth(width);
  const toothHeight = toothWidth / 2;
  const square = toothWidth / Math.SQRT2;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.edge, { height: toothHeight }, side === 'top' ? styles.edgeTop : styles.edgeBottom]}
    >
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ height: toothHeight, width: toothWidth }}>
          <View
            style={[
              styles.tooth,
              {
                height: square,
                left: (toothWidth - square) / 2,
                top: side === 'top' ? toothHeight - square / 2 : -square / 2,
                width: square,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: receiptPaper.surface,
    paddingBottom: spacing.base,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    ...nativeShadows.lifted,
  },
  tearLine: { height: 1, marginVertical: spacing.base, overflow: 'hidden' },
  tearLineDashes: {
    borderColor: receiptPaper.separator,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 2,
  },
  edge: { flexDirection: 'row', overflow: 'hidden' },
  edgeTop: { left: 0, position: 'absolute', right: 0, top: 0 },
  // The paper is drawn before the bottom edge: tuck the teeth under its last
  // hairline so no seam can open between the two.
  edgeBottom: { marginTop: -StyleSheet.hairlineWidth },
  tooth: {
    backgroundColor: receiptPaper.surface,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
});
