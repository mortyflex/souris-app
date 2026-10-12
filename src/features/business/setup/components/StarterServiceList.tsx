// BeautIzzy — the starter prestations list of onboarding
//
// One white grouped surface, one row per proposed prestation: the family
// pictogram (the same one Prestations & tarifs shows), the name, the total
// duration, and the selection check. Every row is a checkbox that announces
// its selected state; tapping it keeps or removes the prestation before
// anything is written.

import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PrestationIcon } from '@/features/services/components/PrestationIcon';
import { formatServiceDuration } from '@/features/services/presentation';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { interaction, semanticColors, spacing } from '@/shared/ui/theme';

import { getStarterDurationMinutes, type StarterService } from '../starter-services';
import { SelectionCheck } from './SelectionCheck';

const ROW_ICON = 44;
const SEPARATOR_INSET = spacing.base + ROW_ICON + spacing.md;

interface StarterServiceListProps {
  readonly starters: readonly StarterService[];
  readonly selectedKeys: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly disabled?: boolean;
}

export function StarterServiceList({ starters, selectedKeys, onToggle, disabled = false }: StarterServiceListProps) {
  return (
    <GroupedSurface testID="starter-services">
      {starters.map((starter, index) => {
        const selected = selectedKeys.has(starter.key);
        const duration = formatServiceDuration(getStarterDurationMinutes(starter));
        return (
          <Fragment key={starter.key}>
            {index > 0 && <GroupedSeparator inset={SEPARATOR_INSET} />}
            <Pressable
              accessibilityLabel={`${starter.name}, ${duration}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onToggle(starter.key)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID={`starter-${starter.key}`}
            >
              <PrestationIcon prestation={starter} size="row" testID={`starter-${starter.key}-icon`} />
              <View style={styles.copy}>
                <AppText numberOfLines={1} style={styles.name} variant="rowTitle">
                  {starter.name}
                </AppText>
                <AppText style={styles.duration} variant="metadata">
                  {duration}
                </AppText>
              </View>
              <SelectionCheck selected={selected} />
            </Pressable>
          </Fragment>
        );
      })}
    </GroupedSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender, opacity: interaction.pressedOpacity },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  duration: { color: semanticColors.foregroundSoft },
});
