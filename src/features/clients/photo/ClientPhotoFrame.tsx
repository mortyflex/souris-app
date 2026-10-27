// BeautIzzy — Client photo frame
//
// The validated portrait ClientAvatar made into ONE button, with the small
// camera badge on its bottom-right corner — the photo control of the Client
// Profile (80 pt) and the photo field of « Ajouter un client » (112 pt)
// share this exact frame. The badge is sized from the frame: the 32 pt badge
// of the 80 pt Profile frame is the reference, and it grows at HALF the
// frame's rate so a larger portrait keeps a discreet badge instead of a
// chunky one. It only presents: what a tap opens, and what happens to a
// photo, belongs to the caller (ClientPhotoControl stores at once;
// ClientPhotoField keeps a draft until the Client is added). While `busy` the
// frame shows a spinner in the badge and ignores taps; the rest of the
// screen stays usable.

import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { Client } from '@/domain/clients';
import { ClientAvatar } from '@/features/clients/avatar/ClientAvatar';
import { interaction, nativeShadows, radii, semanticColors } from '@/shared/ui/theme';

/** The Client Profile portrait, whose badge is the reference. */
const REFERENCE_FRAME_SIZE = 80;
const REFERENCE_BADGE_SIZE = 32;
const REFERENCE_BADGE_SYMBOL_SIZE = 15;
/** How far the badge sits outside the frame's corner, so it covers little of the portrait. */
const REFERENCE_BADGE_OFFSET = 6;

export interface ClientPhotoBadgeMetrics {
  readonly size: number;
  readonly symbolSize: number;
  /** Distance of the badge outside the frame's corner (bottom and right). */
  readonly offset: number;
}

/** The badge of a frame of `frameSize`: 32 / 15 / 6 at 80 pt, 38 / 18 / 7 at 112 pt. */
export function clientPhotoBadgeMetrics(frameSize: number): ClientPhotoBadgeMetrics {
  const scale = 1 + (frameSize - REFERENCE_FRAME_SIZE) / REFERENCE_FRAME_SIZE / 2;
  return {
    size: Math.round(REFERENCE_BADGE_SIZE * scale),
    symbolSize: Math.round(REFERENCE_BADGE_SYMBOL_SIZE * scale),
    offset: Math.round(REFERENCE_BADGE_OFFSET * scale),
  };
}

interface ClientPhotoFrameProps {
  readonly client: Pick<Client, 'firstName' | 'lastName'>;
  /** The displayable portrait (a stored photo, or a draft); initials without it. */
  readonly photoUri: string | undefined;
  readonly size: number;
  readonly busy: boolean;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  readonly onPress: () => void;
  /** Prefix of the testIDs: `<prefix>-button`, `<prefix>-badge`, `<prefix>-busy`. */
  readonly testID: string;
}

export function ClientPhotoFrame({
  client,
  photoUri,
  size,
  busy,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  testID,
}: ClientPhotoFrameProps) {
  const badge = clientPhotoBadgeMetrics(size);
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [{ height: size, width: size }, pressed && styles.pressed]}
      testID={`${testID}-button`}
    >
      <ClientAvatar accessible={false} client={client} photoUri={photoUri} shape="portrait" size={size} />
      <View
        pointerEvents="none"
        style={[
          styles.badge,
          { bottom: -badge.offset, height: badge.size, right: -badge.offset, width: badge.size },
        ]}
        testID={`${testID}-badge`}
      >
        {busy ? (
          <ActivityIndicator color={semanticColors.accent} size="small" testID={`${testID}-busy`} />
        ) : (
          <SymbolView
            name={{ ios: 'camera.fill', android: 'photo_camera' }}
            size={badge.symbolSize}
            tintColor={semanticColors.accent}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: interaction.pressedOpacity },
  badge: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderLavender,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    position: 'absolute',
    ...nativeShadows.raised,
  },
});
