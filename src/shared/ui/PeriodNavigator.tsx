// BeautIzzy — PeriodNavigator
//
// The ONE grouped period control of BeautIzzy (Agenda Jour / Semaine, Caisse
// Jour / Mois): previous, the selected period, an optional extra control
// (the calendar of the day navigators) and next, on a single quiet surface
// so the whole row reads as one module:
//
//   ╭──────────────────────────────────────────────╮
//   │ ( ‹ )      Mardi 22 sept.      ( ▦ ) ( › )   │
//   │             Aujourd’hui                      │
//   ╰──────────────────────────────────────────────╯
//
// Presentation only — the caller owns the period, its wording and what each
// control does. The centre is the caller's copy; `PeriodNavigatorCopy` is
// the standard one (title + optional quiet secondary line).

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { GlassIconButton, glassIcons } from './GlassIconButton';
import { interaction, radii, semanticColors, spacing } from './theme';

interface PeriodNavigatorProps {
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  /** Centre copy; laid out in the width left between the controls. */
  readonly children: ReactNode;
  /** Measures the width left between the controls. */
  readonly onCopyLayout?: (event: LayoutChangeEvent) => void;
  /** Extra control placed right before « next » (e.g. choose a date). */
  readonly trailing?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** Prefix of the control test IDs: `-previous`, `-next`. */
  readonly testID?: string;
}

export function PeriodNavigator({
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  children,
  onCopyLayout,
  trailing,
  style,
  testID,
}: PeriodNavigatorProps) {
  return (
    <View style={[styles.surface, style]} testID={testID}>
      <GlassIconButton
        accessibilityLabel={previousLabel}
        icon={glassIcons.previous}
        onPress={onPrevious}
        testID={testID ? `${testID}-previous` : undefined}
      />
      <View onLayout={onCopyLayout} style={styles.copy}>
        {children}
      </View>
      {trailing}
      <GlassIconButton
        accessibilityLabel={nextLabel}
        icon={glassIcons.next}
        onPress={onNext}
        testID={testID ? `${testID}-next` : undefined}
      />
    </View>
  );
}

interface PeriodNavigatorCopyProps {
  readonly title: string;
  /** Quiet context under the title: a `PeriodNavigatorNote` or a way back. */
  readonly secondary?: ReactNode;
  readonly titleTestID?: string;
}

/** Standard centre copy: the period in `sectionTitle`, one quiet line under it. */
export function PeriodNavigatorCopy({ title, secondary, titleTestID }: PeriodNavigatorCopyProps) {
  return (
    <>
      <AppText numberOfLines={1} style={styles.title} testID={titleTestID} variant="sectionTitle">
        {title}
      </AppText>
      {secondary}
    </>
  );
}

/** The quiet violet line under the period: a static indication, never a control. */
export function PeriodNavigatorNote({ children, testID }: { readonly children: string; readonly testID?: string }) {
  return (
    <AppText variant="metadata" style={styles.secondary} testID={testID}>
      {children}
    </AppText>
  );
}

/** The way back to the current period, offered on the same quiet line. */
export function PeriodNavigatorLink({
  label,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
      testID={testID}
    >
      <AppText variant="metadata" style={styles.secondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  copy: { alignItems: 'center', flex: 1, minWidth: 0 },
  title: { color: semanticColors.foreground, textAlign: 'center' },
  secondary: { color: semanticColors.accent, textAlign: 'center' },
  pressed: { opacity: interaction.pressedOpacity },
});
