// BeautIzzy — EstimationTicket
//
// The generated « Estimation tarifaire », presented by the SAME receipt
// printer as « Résumé du jour » and « Tops & tendances »: the page dims, the
// printer capsule lands, and the paper feeds out.
//
// ONE interior (EstimationDocument), two presentations — the exact pipeline
// of « Tops & tendances » (BusinessInsightsTicket):
//
//   printer   `ReceiptPaper`, the torn-edge ticket every BeautIzzy receipt feeds
//             out of the printer (BusinessInsightsReceipt uses the same)
//   export    `ImageExportFrame` on the shared share ground, holding the
//             shared `ShareCardCanvas` (BusinessInsightsShareCard uses the
//             same): full-bleed warm paper, 360 dp wide, share-card margins,
//             exported at 3×. At least the 9:16 story (1080 × 1920 px) —
//             exactly Tops & tendances for an ordinary estimation — and
//             taller only when a long one needs it, never cut.
//
// Actions under the paper, in the export language of « Tops & tendances »:
//
//   Fermer       closes. Nothing is kept anywhere in BeautIzzy.
//   Enregistrer  the image straight to Photos (add-only permission) through
//                the shared `saveViewToPhotos`: « Image enregistrée dans
//                Photos » and one success haptic once the library has it.
//   Partager     the native share sheet through the shared
//                `shareViewAsImage`. It reports no outcome.
//
// Both capture the off-screen ImageExportFrame, sized from the canvas's
// measured height. The ticket scrolls when it is taller than the room the
// printer leaves.
//
// One action at a time; a failure shows one retryable line.

import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { PhotosPermissionError, saveViewToPhotos, shareViewAsImage } from '@/shared/lib/share-image';
import { glassIcons } from '@/shared/ui/GlassIconButton';
import { ImageExportFrame } from '@/shared/ui/ImageExportFrame';
import { ReceiptPaper } from '@/shared/ui/ReceiptPaper';
import { ReceiptPrinter } from '@/shared/ui/ReceiptPrinter';
import {
  SHARE_CARD_BACKGROUND,
  SHARE_CARD_SIZE,
  ShareCardCanvas,
  getShareImagePixelSize,
} from '@/shared/ui/ShareCardCanvas';

import { EstimationDocument } from './EstimationDocument';
import type { EstimationDocumentModel } from './estimation-document';

export const ESTIMATION_SHARE_ERROR = 'Impossible de préparer le partage.';
export const ESTIMATION_SAVED = 'Image enregistrée dans Photos';
export const ESTIMATION_SAVE_ERROR = 'Impossible d’enregistrer l’image.';
export const ESTIMATION_SAVE_PERMISSION_ERROR =
  'BeautIzzy n’a pas accès à Photos. Autorisez-le dans Réglages pour enregistrer l’image.';
/** How long the save confirmation stays before it quietly goes away (ms). */
export const ESTIMATION_SAVED_NOTICE_DURATION = 2600;

type ExportAction = 'share' | 'save';

interface EstimationTicketProps {
  readonly visible: boolean;
  readonly model: EstimationDocumentModel | undefined;
  readonly onClose: () => void;
}

export function EstimationTicket({ visible, model, onClose }: EstimationTicketProps) {
  const [exportHeight, setExportHeight] = useState<number>();
  const [working, setWorking] = useState<ExportAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const exportFrame = useRef<View>(null);
  const busy = useRef(false);

  // A notice belongs to one opening: closing the ticket forgets it.
  if (!visible && notice !== null) setNotice(null);

  useEffect(() => {
    if (notice !== ESTIMATION_SAVED) return;
    const hide = setTimeout(() => setNotice(null), ESTIMATION_SAVED_NOTICE_DURATION);
    return () => clearTimeout(hide);
  }, [notice]);

  const measureExport = (event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height);
    if (height > 0) setExportHeight(height);
  };

  const pixelSize = exportHeight === undefined ? undefined : getShareImagePixelSize(exportHeight);

  const run = async (action: ExportAction) => {
    if (busy.current || pixelSize === undefined) return;
    busy.current = true;
    setWorking(action);
    setNotice(null);
    try {
      if (action === 'share') {
        haptics.action();
        await shareViewAsImage(exportFrame, pixelSize, 'Partager l’estimation');
      } else {
        await saveViewToPhotos(exportFrame, pixelSize);
        haptics.success();
        setNotice(ESTIMATION_SAVED);
      }
    } catch (error) {
      setNotice(
        action === 'share'
          ? ESTIMATION_SHARE_ERROR
          : error instanceof PhotosPermissionError
            ? ESTIMATION_SAVE_PERMISSION_ERROR
            : ESTIMATION_SAVE_ERROR,
      );
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  const exportUnavailable = working !== null || pixelSize === undefined;

  return (
    <ReceiptPrinter
      actionNotice={notice ?? undefined}
      actions={[
        {
          icon: glassIcons.saveImage,
          accessibilityLabel: 'Enregistrer l’image',
          onPress: () => void run('save'),
          busy: working === 'save',
          disabled: exportUnavailable,
          testID: 'estimation-save',
        },
        {
          icon: glassIcons.share,
          accessibilityLabel: 'Partager',
          onPress: () => void run('share'),
          busy: working === 'share',
          disabled: exportUnavailable,
          testID: 'estimation-share',
        },
      ]}
      backdropLabel="Fermer l’estimation"
      offstage={
        model === undefined ? undefined : (
          <ImageExportFrame
            backgroundColor={SHARE_CARD_BACKGROUND}
            layoutSize={{ width: SHARE_CARD_SIZE.width, height: exportHeight ?? 0 }}
            pixelSize={pixelSize ?? getShareImagePixelSize(0)}
            ref={exportFrame}
            testID="estimation-export-frame"
          >
            <ShareCardCanvas height="growable" onLayout={measureExport} testID="estimation-export-canvas">
              <EstimationDocument fixedTypography model={model} testID="estimation-export-document" />
            </ShareCardCanvas>
          </ImageExportFrame>
        )
      }
      onClose={onClose}
      renderReceipt={({ width, maxHeight }) =>
        model === undefined ? null : (
          <ReceiptPaper maxHeight={maxHeight} testID="estimation-document-paper" width={width}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              testID="estimation-paper-scroll"
            >
              <EstimationDocument model={model} />
            </ScrollView>
          </ReceiptPaper>
        )
      }
      testID="estimation"
      visible={visible}
    />
  );
}

const styles = StyleSheet.create({
  // The ticket never grows past the printer's room: the whole interior scrolls.
  scroll: { flexGrow: 0, flexShrink: 1 },
});
