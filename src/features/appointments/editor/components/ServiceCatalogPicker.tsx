// Souris — « Ajouter des prestations » (existing Appointment editing)
//
// Search, then the Services / Techniques segment, then ONE dense list of the
// active catalog Services of the chosen type (DESIGN_OVERRIDES.md §27). Both
// categories render through the same row: only the data and the category
// colours (`serviceCategoryColors`, keyed by the domain ServiceType) change.
//
// The category is never colour alone: the segment says which list is shown,
// and a selected row states it with a check in a filled circle (an empty ring
// otherwise) plus its accessibility state.
//
// Embeddable block with no scroll container of its own: the editor's single
// vertical scroll carries it. Search filters inside the chosen category; when
// it finds nothing there but matches in the other one, the empty state offers
// the switch instead of silently hiding them.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { Service, ServiceType } from '@/domain/appointments';
import { AppText } from '@/shared/ui/AppText';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { SearchField } from '@/shared/ui/SearchField';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import {
  foregroundSoft,
  interaction,
  semanticColors,
  serviceCategoryColors,
  spacing,
} from '@/shared/ui/theme';

import { filterServicesOfType } from '../selection-sections';
import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '../presentation';

const categoryLabels: Readonly<Record<ServiceType, string>> = {
  SERVICE: 'Services',
  TECHNIQUE: 'Techniques',
};

const categoryOptions: readonly SegmentedControlOption<ServiceType>[] = (
  ['SERVICE', 'TECHNIQUE'] as const
).map((type) => ({
  value: type,
  label: categoryLabels[type],
  selectedColor: serviceCategoryColors[type].strong,
  testID: `catalog-category-${type}`,
}));

const emptyCategoryTitles: Readonly<Record<ServiceType, string>> = {
  SERVICE: 'Aucun service disponible',
  TECHNIQUE: 'Aucune technique disponible',
};

/** Leading indent of the row separators: row padding + dot + gap. */
const ROW_PADDING = spacing.base;
const DOT_SIZE = 8;
const SEPARATOR_INSET = ROW_PADDING + DOT_SIZE + spacing.md;

interface ServiceCatalogPickerProps {
  /** Selectable catalog (active Services supplied by the parent use case). */
  readonly services: readonly Service[];
  readonly selectedServiceIds: readonly string[];
  readonly onSelectService: (service: Service) => void;
}

export function ServiceCatalogPicker({
  services,
  selectedServiceIds,
  onSelectService,
}: ServiceCatalogPickerProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ServiceType>('SERVICE');
  const otherCategory: ServiceType = category === 'SERVICE' ? 'TECHNIQUE' : 'SERVICE';
  const searching = query.trim().length > 0;

  const rows = useMemo(
    () => filterServicesOfType(services, category, query),
    [services, category, query],
  );
  const otherMatches = useMemo(
    () => (searching ? filterServicesOfType(services, otherCategory, query).length : 0),
    [services, otherCategory, query, searching],
  );

  return (
    <View style={styles.container} testID="service-catalog-picker">
      <SearchField
        accessibilityLabel="Rechercher une prestation"
        onChangeText={setQuery}
        placeholder="Rechercher une prestation"
        value={query}
      />
      <SegmentedControl
        onChange={setCategory}
        options={categoryOptions}
        stretch
        testID="catalog-category"
        value={category}
      />

      {rows.length > 0 ? (
        <GroupedSurface testID={`catalog-list-${category}`}>
          {rows.map((service, index) => (
            <ServiceCatalogRow
              key={service.id}
              onPress={() => onSelectService(service)}
              selected={selectedServiceIds.includes(service.id)}
              separated={index > 0}
              service={service}
            />
          ))}
        </GroupedSurface>
      ) : (
        <View style={styles.emptyState} testID="catalog-empty">
          <AppText variant="stateTitle">
            {searching ? 'Aucune prestation trouvée' : emptyCategoryTitles[category]}
          </AppText>
          {searching && otherMatches > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={spacing.sm}
              onPress={() => setCategory(otherCategory)}
              style={({ pressed }) => [styles.switchAction, pressed && styles.pressed]}
              testID="catalog-show-other-category"
            >
              <AppText
                variant="control"
                style={{ color: serviceCategoryColors[otherCategory].strong }}
              >
                {`Voir ${otherMatches} résultat${otherMatches > 1 ? 's' : ''} dans ${categoryLabels[otherCategory]}`}
              </AppText>
            </Pressable>
          ) : (
            <AppText variant="metadata" style={styles.emptyStateText}>
              {searching
                ? 'Essayez un autre nom.'
                : 'Activez une prestation depuis Prestations & tarifs.'}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

interface ServiceCatalogRowProps {
  readonly service: Service;
  readonly selected: boolean;
  readonly separated: boolean;
  readonly onPress: () => void;
}

function ServiceCatalogRow({ service, selected, separated, onPress }: ServiceCatalogRowProps) {
  const duration = getServiceDurationMinutes(service);
  const processing = getServiceProcessingMinutes(service);
  const colors = serviceCategoryColors[service.type];
  const meta =
    processing > 0
      ? `${formatCreationDuration(duration)} · dont ${formatCreationDuration(processing)} de pose`
      : formatCreationDuration(duration);

  return (
    <View>
      {separated && <GroupedSeparator inset={SEPARATOR_INSET} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${service.name}, ${formatCreationDuration(duration)}, ${formatCreationPrice(service.price)}`}
        accessibilityHint={selected ? 'Déjà dans le rendez-vous' : 'Ajouter au rendez-vous'}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          selected && { backgroundColor: colors.tint },
          pressed && styles.rowPressed,
        ]}
        testID={`service-row-${service.id}`}
      >
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
        <View style={styles.copy}>
          <AppText variant="control" numberOfLines={2} style={styles.name}>
            {service.name}
          </AppText>
          <AppText variant="metadata" numberOfLines={1} style={styles.meta}>
            {meta}
          </AppText>
        </View>
        <AppText variant="metadata" style={styles.price}>
          {formatCreationPrice(service.price)}
        </AppText>
        <View
          style={[
            styles.indicator,
            selected
              ? { backgroundColor: colors.accent, borderColor: colors.accent }
              : styles.indicatorEmpty,
          ]}
          testID={`service-row-${service.id}-${selected ? 'selected' : 'unselected'}`}
        >
          {selected && (
            <SymbolView
              name={{ ios: 'checkmark', android: 'check' }}
              size={11}
              tintColor={semanticColors.surfaceElevated}
            />
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  dot: { borderRadius: DOT_SIZE / 2, height: DOT_SIZE, width: DOT_SIZE },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { color: semanticColors.foreground },
  meta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  indicator: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  indicatorEmpty: { borderColor: semanticColors.foregroundMuted },
  emptyState: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, textAlign: 'center' },
  switchAction: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  pressed: { opacity: interaction.pressedOpacity },
});
