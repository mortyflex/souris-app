// BeautIzzy — photo source sheet
//
// Compact action list on the shared BottomSheet: ONE heading (« Photo du
// client », « Photo du produit » — no eyebrow above it), then camera, library,
// and remove when a photo exists, then « Annuler ». It never touches business
// state, never asks for a permission and never presents the camera itself —
// PhotoSourceFlow opens the camera only after this sheet has been fully
// dismissed, so one modal is active at a time. The title is caller-owned; the
// rows read the same everywhere (PHOTO_LIBRARY_LABEL), though a caller may
// still pass its own `libraryLabel`.

import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

/** The ONE wording of the library row, shared by Client and Product photos. */
export const PHOTO_LIBRARY_LABEL = 'Choisir dans la photothèque';

interface PhotoSourceSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly hasImage: boolean;
  /** Defaults to PHOTO_LIBRARY_LABEL. */
  readonly libraryLabel?: string;
  readonly onChooseCamera: () => void;
  readonly onChooseLibrary: () => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
  readonly onDismissed?: () => void;
  /** Prefix of every testID: `<prefix>-sheet`, `<prefix>-source-camera`, … */
  readonly testID: string;
}

export function PhotoSourceSheet({
  visible,
  title,
  hasImage,
  libraryLabel = PHOTO_LIBRARY_LABEL,
  onChooseCamera,
  onChooseLibrary,
  onRemove,
  onClose,
  onDismissed,
  testID,
}: PhotoSourceSheetProps) {
  return (
    <BottomSheet
      backdropLabel="Fermer"
      header={<SheetHeader style={styles.header} title={title} />}
      onClose={onClose}
      onDismissed={onDismissed}
      testID={`${testID}-sheet`}
      visible={visible}
    >
      <View style={styles.options}>
        <SourceOption
          icon={{ ios: 'camera.fill', android: 'photo_camera' }}
          label={hasImage ? 'Prendre une nouvelle photo' : 'Prendre une photo'}
          onPress={onChooseCamera}
          testID={`${testID}-source-camera`}
        />
        <SourceOption
          icon={{ ios: 'photo.on.rectangle', android: 'photo_library' }}
          label={libraryLabel}
          onPress={onChooseLibrary}
          testID={`${testID}-source-library`}
        />
        {hasImage && (
          <SourceOption
            destructive
            icon={{ ios: 'trash', android: 'delete' }}
            label="Supprimer la photo"
            onPress={onRemove}
            testID={`${testID}-source-remove`}
          />
        )}
      </View>
      <AppButton onPress={onClose} style={styles.cancel} title="Annuler" variant="secondary" />
    </BottomSheet>
  );
}

interface SourceOptionProps {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  readonly destructive?: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

function SourceOption({ icon, label, destructive = false, onPress, testID }: SourceOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        pressed && (destructive ? styles.optionPressedDestructive : styles.optionPressed),
      ]}
      testID={testID}
    >
      <View style={[styles.optionIcon, destructive && styles.optionIconDestructive]}>
        <SymbolView
          name={icon}
          size={18}
          tintColor={destructive ? rose.rose600 : semanticColors.accent}
        />
      </View>
      <AppText variant="rowTitle" style={destructive ? styles.optionLabelDestructive : undefined}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Without an eyebrow the title alone opens the sheet: a touch more room
  // above it keeps the heading clear of the grabber, and the sheet stays compact.
  header: { paddingTop: spacing.base },
  options: { gap: spacing.xs, paddingBottom: spacing.base },
  option: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  optionPressed: { backgroundColor: semanticColors.surfaceLavender },
  optionPressedDestructive: { backgroundColor: semanticColors.surfaceRose },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  optionIconDestructive: { backgroundColor: semanticColors.surfaceRose },
  optionLabelDestructive: { color: rose.rose600 },
  cancel: { marginBottom: spacing.base },
});
