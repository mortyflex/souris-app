// BeautIzzy — Agenda appointment card (DESIGN_OVERRIDES.md §19)
//
// One staff segment of an Appointment on the Day timeline. The pastel family,
// the flat fill and the 3 pt accent are untouched; the composition follows
// the height the timeline gives the card:
//
//   tall     [ portrait ]  Client name      grouped at the START line,
//                          Prestations      never centred in a long block
//                          Phases
//   medium   [ portrait ]  Client name      two tight centred lines
//                          Prestations
//   compact  First name · Prestation        one line
//   visual   colour only
//
// Neither the time nor the duration is written: the grid places the card and
// its height is the duration. Everything shown is already on the segment. The
// identity disc shows the client's photo when the caller has a displayable
// one, the initials otherwise (and when the photo fails to load); a card too
// narrow for it (overlap columns) simply drops the disc.

import { useState } from "react";
import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/shared/ui/AppText";
import {
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from "@/features/appointments/presentation";
import {
  interaction,
  nativeShadows,
  radii,
  semanticColors,
  spacing,
} from "@/shared/ui/theme";

import {
  getAgendaAppointmentCardColors,
  type AgendaAppointmentPalette,
} from "../appointment-palette";
import type { AgendaStaffSegment } from "../layout/agenda-staff-segments";
import {
  getAgendaSegmentContent,
  getAgendaSegmentDensity,
} from "../segment-content";

/** Initials disc: beside the name + prestations pair on a tall card, smaller on a medium one. */
const TALL_AVATAR_SIZE = 32;
const MEDIUM_AVATAR_SIZE = 24;
/** Below this card width (overlap columns) the text keeps the whole line. */
const AVATAR_MIN_CARD_WIDTH = 140;

// Line boxes of a tall card. Name + prestations + phases (48) fit the
// shortest tall card (56) under the top inset; the phase line joins only
// while the card has the height for it.
const TALL_TOP_INSET = 4;
const NAME_LINE = 18;
const SERVICE_LINE = 15;
const PHASE_LINE = 15;

interface AppointmentBlockProps {
  readonly clientName: string;
  /** Up to two initials of the client; absent → no identity disc. */
  readonly clientInitials?: string;
  /** A displayable client photo, shown in the disc instead of the initials. */
  readonly clientPhotoUri?: string;
  readonly segment: AgendaStaffSegment;
  readonly height: number;
  /** Card width on the timeline; absent → assumed wide enough. */
  readonly width?: number;
  readonly palette: AgendaAppointmentPalette;
  readonly onPress: () => void;
}

export function AppointmentBlock({
  clientName,
  clientInitials,
  clientPhotoUri,
  segment,
  height,
  width,
  palette,
  onPress,
}: AppointmentBlockProps) {
  const density = getAgendaSegmentDensity(height);
  const content = getAgendaSegmentContent(segment, clientName, density);
  const tall = density === "tall";
  // The failed URI, not a flag: a new portrait gets its own chance to load.
  const [failedPhotoUri, setFailedPhotoUri] = useState<string>();
  const showPhoto = clientPhotoUri !== undefined && clientPhotoUri !== failedPhotoUri;
  const showAvatar =
    Boolean(clientInitials) && (width === undefined || width >= AVATAR_MIN_CARD_WIDTH);
  // The phases get their own line only where a tall card has the height.
  const phaseOnOwnLine =
    tall &&
    content.phaseLabel !== undefined &&
    NAME_LINE + SERVICE_LINE + PHASE_LINE <= height - TALL_TOP_INSET - 1;
  const statusLabel = isTerminalAppointmentStatus(segment.status)
    ? getAppointmentStatusLabel(segment.status)
    : undefined;
  const cardColors = getAgendaAppointmentCardColors(palette, segment.status);
  // The corner follows the height — a quarter of it, from 3 up to the medium
  // radius — so short cards stay planning cards, never pills, and roomy cards
  // get a softer corner.
  const borderRadius = Math.min(radii.medium, Math.max(3, Math.round(height / 4)));
  const accessibilityLabel = [
    clientName,
    segment.serviceName,
    segment.phaseNames.join(", "),
    statusLabel,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        tall && styles.tallContainer,
        {
          backgroundColor: cardColors.background,
          borderLeftColor: cardColors.accent,
          borderRadius,
        },
        cardColors.elevated && nativeShadows.card,
        pressed && styles.pressed,
      ]}
    >
      {content.mode === "lines" && (
        <View style={[styles.cluster, tall && styles.tallCluster]}>
          {showAvatar && (
            <View
              style={[styles.avatar, tall ? styles.tallAvatar : styles.mediumAvatar]}
              testID="appointment-block-avatar"
            >
              {showPhoto ? (
                <Image
                  accessible={false}
                  contentFit="cover"
                  onError={() => setFailedPhotoUri(clientPhotoUri)}
                  source={{ uri: clientPhotoUri }}
                  style={StyleSheet.absoluteFill}
                  testID="appointment-block-photo"
                />
              ) : (
                <AppText
                  variant="chip"
                  maxFontSizeMultiplier={1.2}
                  numberOfLines={1}
                  style={[
                    tall ? styles.tallInitials : styles.mediumInitials,
                    { color: cardColors.primaryText },
                  ]}
                >
                  {clientInitials}
                </AppText>
              )}
            </View>
          )}
          <View style={styles.copy}>
            <AppText
              variant="rowTitle"
              numberOfLines={1}
              style={[
                styles.clientName,
                tall && styles.tallClientName,
                { color: cardColors.primaryText },
              ]}
            >
              {content.clientLabel}
            </AppText>
            <AppText
              variant="metadata"
              numberOfLines={1}
              style={[styles.serviceName, { color: cardColors.secondaryText }]}
            >
              {content.serviceLabel}
              {content.showReprise && (
                <AppText
                  variant="metadata"
                  style={[styles.inlineState, { color: cardColors.tertiaryText }]}
                >
                  {" · Reprise"}
                </AppText>
              )}
              {content.phaseLabel && !phaseOnOwnLine && (
                <AppText
                  variant="metadata"
                  style={{ color: cardColors.tertiaryText }}
                >
                  {" · "}
                  {content.phaseLabel}
                </AppText>
              )}
            </AppText>
            {content.phaseLabel && phaseOnOwnLine && (
              <AppText
                variant="metadata"
                numberOfLines={1}
                style={[styles.phaseName, { color: cardColors.tertiaryText }]}
                testID="appointment-block-phase"
              >
                {content.phaseLabel}
              </AppText>
            )}
          </View>
        </View>
      )}
      {content.mode === "compact" && (
        <AppText
          variant="chip"
          numberOfLines={1}
          style={[styles.compactLine, { color: cardColors.primaryText }]}
        >
          {content.compactClientLabel}
          <AppText
            variant="metadata"
            style={{ color: cardColors.tertiaryText }}
          >
            {" · "}
            {content.compactSecondaryLabel}
          </AppText>
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
  },
  tallContainer: { justifyContent: "flex-start", paddingTop: TALL_TOP_INSET },
  cluster: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  tallCluster: { alignItems: "flex-start" },
  // A solid white disc: the pastel fill stays flat, nothing is laid over it.
  avatar: {
    alignItems: "center",
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    justifyContent: "center",
    overflow: "hidden",
  },
  tallAvatar: { height: TALL_AVATAR_SIZE, width: TALL_AVATAR_SIZE },
  mediumAvatar: { height: MEDIUM_AVATAR_SIZE, width: MEDIUM_AVATAR_SIZE },
  tallInitials: { fontSize: 12, lineHeight: 16 },
  mediumInitials: { fontSize: 10, lineHeight: 13 },
  copy: { flex: 1, minWidth: 0 },
  clientName: { lineHeight: 16 },
  tallClientName: { lineHeight: NAME_LINE },
  serviceName: { lineHeight: SERVICE_LINE },
  inlineState: { lineHeight: SERVICE_LINE },
  phaseName: { lineHeight: PHASE_LINE },
  compactLine: { lineHeight: 14 },
  pressed: {
    transform: [{ scale: interaction.cardPressedScale }],
  },
});
