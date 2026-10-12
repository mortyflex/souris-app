// BeautIzzy — the personalised recap of « Votre espace BeautIzzy est prêt »
//
// Three compact rows on one grouped surface — the primary activity, the
// reminder decision, the starter prestations — read from what the
// professional actually chose. Small summary rows, never dashboard cards.

import { SymbolView } from 'expo-symbols';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BusinessActivityType } from '@/domain/business';
import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { getActivityIcon } from '../activity-options';
import { formatBusinessActivityType } from '../../presentation';

export interface SetupRecapValues {
  readonly activityType: BusinessActivityType;
  readonly remindersEnabled: boolean;
  readonly starterServiceCount: number;
}

interface RecapRow {
  readonly key: string;
  readonly icon: PlatformSymbolName;
  readonly value: string;
  readonly label: string;
}

const reminderIcon = { ios: 'bell.badge', android: 'notifications_active' } as const satisfies PlatformSymbolName;
const servicesIcon = { ios: 'list.bullet.rectangle', android: 'checklist' } as const satisfies PlatformSymbolName;

/** The spoken and written recap lines — pure, so the wording is testable. */
export function buildSetupRecapRows(values: SetupRecapValues): readonly RecapRow[] {
  const { starterServiceCount: count } = values;
  return [
    {
      key: 'activity',
      icon: getActivityIcon(values.activityType),
      value: formatBusinessActivityType(values.activityType),
      label: 'Votre activité principale',
    },
    {
      key: 'reminders',
      icon: reminderIcon,
      value: values.remindersEnabled ? 'Rappels activés' : 'À configurer plus tard',
      label: 'Rappels par e-mail',
    },
    {
      key: 'services',
      icon: servicesIcon,
      value: count > 0 ? `${count} prestation${count > 1 ? 's' : ''} prête${count > 1 ? 's' : ''}` : 'Prestations à ajouter plus tard',
      label: 'Prestations & tarifs',
    },
  ];
}

const SEPARATOR_INSET = spacing.base + 40 + spacing.md;

export function SetupRecap(values: SetupRecapValues) {
  return (
    <GroupedSurface testID="setup-recap">
      {buildSetupRecapRows(values).map((row, index) => (
        <Fragment key={row.key}>
          {index > 0 && <GroupedSeparator inset={SEPARATOR_INSET} />}
          <View
            accessible
            accessibilityLabel={`${row.label} : ${row.value}`}
            style={styles.row}
            testID={`setup-recap-${row.key}`}
          >
            <View style={styles.glyph}>
              <SymbolView name={row.icon} size={18} tintColor={semanticColors.accent} />
            </View>
            <View style={styles.copy}>
              <AppText numberOfLines={1} style={styles.value} variant="rowTitle">
                {row.value}
              </AppText>
              <AppText style={styles.label} variant="metadata">
                {row.label}
              </AppText>
            </View>
          </View>
        </Fragment>
      ))}
    </GroupedSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  value: { color: semanticColors.foreground },
  label: { color: semanticColors.foregroundSoft },
});
