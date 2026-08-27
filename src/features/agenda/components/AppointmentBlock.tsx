import { Platform, Pressable, StyleSheet } from "react-native";

import { AppText } from "@/shared/ui/AppText";
import { interaction, radii, semanticColors } from "@/shared/ui/theme";

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
  const accessibilityLabel = `${clientName}, ${segment.serviceName}, ${segment.phaseNames.join(", ")}`;

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderLeftColor: palette.accent,
        },
        pressed && styles.pressed,
      ]}
    >
      {content.mode === "lines" && (
        <>
          <AppText
            variant="rowTitle"
            numberOfLines={1}
            style={[styles.clientName, { color: palette.primaryText }]}
          >
            {content.clientLabel}
          </AppText>
          <AppText
            variant="metadata"
            numberOfLines={1}
            style={[styles.serviceName, { color: palette.secondaryText }]}
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
          style={[styles.compactLine, { color: palette.primaryText }]}
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
    opacity: 0.9,
    transform: [{ scale: interaction.cardPressedScale }],
  },
});
