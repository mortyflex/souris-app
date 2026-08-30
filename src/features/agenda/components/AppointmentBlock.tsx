import { Platform, Pressable, StyleSheet } from "react-native";

import { AppText } from "@/shared/ui/AppText";
import {
  getAppointmentStatusLabel,
  isTerminalAppointmentStatus,
} from "@/features/appointments/presentation";
import {
  foregroundSoft,
  interaction,
  radii,
  semanticColors,
} from "@/shared/ui/theme";

import type { AgendaAppointmentPalette } from "../appointment-palette";
import type { AgendaStaffSegment } from "../layout/agenda-staff-segments";
import {
  getAgendaSegmentContent,
  getAgendaSegmentDensity,
} from "../segment-content";

interface AppointmentBlockProps {
  readonly clientName: string;
  readonly segment: AgendaStaffSegment;
  readonly height: number;
  readonly palette: AgendaAppointmentPalette;
  readonly onPress: () => void;
}

export function AppointmentBlock({
  clientName,
  segment,
  height,
  palette,
  onPress,
}: AppointmentBlockProps) {
  const content = getAgendaSegmentContent(
    segment,
    clientName,
    getAgendaSegmentDensity(height),
  );
  const statusLabel = isTerminalAppointmentStatus(segment.status)
    ? getAppointmentStatusLabel(segment.status)
    : undefined;
  const isCompleted = segment.status === "COMPLETED";
  const backgroundColor = isCompleted ? semanticColors.surface : palette.background;
  const borderColor = isCompleted ? semanticColors.borderSubtle : palette.border;
  const accentColor = isCompleted ? semanticColors.foregroundMuted : palette.accent;
  const primaryTextColor = isCompleted ? foregroundSoft : palette.primaryText;
  const secondaryTextColor = isCompleted ? foregroundSoft : palette.secondaryText;
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
        {
          backgroundColor,
          borderColor,
          borderLeftColor: accentColor,
        },
        pressed && styles.pressed,
      ]}
    >
      {content.mode === "lines" && (
        <>
          <AppText
            variant="rowTitle"
            numberOfLines={1}
            style={[styles.clientName, { color: primaryTextColor }]}
          >
            {content.clientLabel}
          </AppText>
          <AppText
            variant="metadata"
            numberOfLines={1}
            style={[styles.serviceName, { color: secondaryTextColor }]}
          >
            {content.serviceLabel}
            {content.showReprise && (
              <AppText
                variant="metadata"
                style={[styles.inlineState, { color: semanticColors.foregroundSoft }]}
              >
                {" · Reprise"}
              </AppText>
            )}
            {content.phaseLabel && !content.phaseOnSeparateLine && (
              <AppText
                variant="metadata"
                style={{ color: semanticColors.foregroundSoft }}
              >
                {" · "}
                {content.phaseLabel}
              </AppText>
            )}
          </AppText>
          {content.phaseLabel && content.phaseOnSeparateLine && (
            <AppText
              variant="metadata"
              numberOfLines={1}
              style={[styles.phaseName, { color: semanticColors.foregroundSoft }]}
            >
              {content.phaseLabel}
            </AppText>
          )}
        </>
      )}
      {content.mode === "compact" && (
        <AppText
          variant="chip"
          numberOfLines={1}
          style={[styles.compactLine, { color: primaryTextColor }]}
        >
          {content.compactClientLabel}
          <AppText
            variant="metadata"
            style={{ color: semanticColors.foregroundSoft }}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    borderRadius: radii[Platform.OS === "android" ? "android" : "ios"].default,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  clientName: { lineHeight: 16 },
  serviceName: { lineHeight: 15 },
  inlineState: { lineHeight: 15 },
  phaseName: { lineHeight: 14 },
  compactLine: { lineHeight: 14 },
  pressed: {
    transform: [{ scale: interaction.cardPressedScale }],
  },
});
