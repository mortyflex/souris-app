// BeautIzzy — Prestation catalogue (shared by creation and editing)
//
// THE prestation picker of « Nouveau rendez-vous » (Prestations step) and
// « Modifier le rendez-vous » (Ajouter des prestations): search, then the
// Services / Techniques segment, then a two-column grid of selectable cards
// (`ServiceSelectionCard`) for the active catalog Services of the chosen type
// (DESIGN_OVERRIDES.md §27). Both categories render through the same card:
// only the data and the category colours (`serviceCategoryColors`, keyed by
// the domain ServiceType) change. What a tap does belongs to the caller —
// creation toggles, editing adds.
//
// The category is never colour alone: the segment says which grid is shown,
// and a selected card states it with a check badge plus its accessibility
// state.
//
// Embeddable block with no scroll container of its own: the caller's single
// vertical scroll carries it. Search filters inside the chosen category; when
// it finds nothing there but matches in the other one, the empty state offers
// the switch instead of silently hiding them.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Service, ServiceType } from '@/domain/appointments';
import { AppText } from '@/shared/ui/AppText';
import { SearchField } from '@/shared/ui/SearchField';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import {
  foregroundSoft,
  interaction,
  serviceCategoryColors,
  spacing,
} from '@/shared/ui/theme';

import { filterServicesOfType, toServiceGridRows } from '../selection-sections';
import { ServiceSelectionCard } from './ServiceSelectionCard';

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

interface ServiceCatalogPickerProps {
  /** Selectable catalog (active Services supplied by the parent use case). */
  readonly services: readonly Service[];
  readonly selectedServiceIds: readonly string[];
  readonly onSelectService: (service: Service) => void;
  /** Spoken on an already selected card: what a tap on it does here. */
  readonly selectedHint?: string;
}

export function ServiceCatalogPicker({
  services,
  selectedServiceIds,
  onSelectService,
  selectedHint = 'Déjà dans le rendez-vous',
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
        <View style={styles.grid} testID={`catalog-list-${category}`}>
          {toServiceGridRows(rows).map(([first, second]) => (
            <View key={first.id} style={styles.gridRow}>
              {[first, second].map((service, index) =>
                service ? (
                  <ServiceSelectionCard
                    key={service.id}
                    accessibilityHint={
                      selectedServiceIds.includes(service.id)
                        ? selectedHint
                        : 'Ajouter au rendez-vous'
                    }
                    onPress={() => onSelectService(service)}
                    selected={selectedServiceIds.includes(service.id)}
                    service={service}
                  />
                ) : (
                  <View key={`spacer-${index}`} style={styles.gridSpacer} />
                ),
              )}
            </View>
          ))}
        </View>
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

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  grid: { gap: spacing.sm },
  // Two equal columns; a row takes the height of its taller card.
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  gridSpacer: { flex: 1 },
  emptyState: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, textAlign: 'center' },
  switchAction: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  pressed: { opacity: interaction.pressedOpacity },
});
