// BeautIzzy — Prestation catalogue (shared by creation and editing)
//
// THE prestation picker of « Nouveau rendez-vous » (Prestations step) and
// « Modifier le rendez-vous » (Ajouter des prestations): search, then the
// Services / Techniques segment, then a two-column grid of selectable cards
// (`ServiceSelectionCard`) for the active catalog Services of the chosen type
// (DESIGN_OVERRIDES.md §27). Both categories render through the same card:
// only the data and the category colours (`serviceCategoryColors`, keyed by
// the domain ServiceType) change. What a tap does belongs to the caller.
//
// Quantity mode (appointment creation and editing pass `onDecrementService`):
// `selectedServiceIds` lists every occurrence, so « Coupe » twice reads ×2 on
// its card; a tap or [+] adds one, [−] removes one. Without it (estimations)
// a selected card keeps its check and the caller toggles.
//
// The category is never colour alone: the segment says which grid is shown,
// and a selected card states it with a check badge plus its accessibility
// state.
//
// Embeddable block with no scroll container of its own: the caller's single
// vertical scroll carries it. Search filters inside the chosen category; when
// it finds nothing there but matches in the other one, the empty state offers
// the switch instead of silently hiding them.
//
// Profession-aware (features/services/catalogue-presentation.ts): with the
// unified `CATEGORIES` organisation (nails, esthetics) there is no segment —
// search covers every prestation and the grid is split under the
// professional's category titles, then « Sans catégorie ». The cards, the
// selection and what a tap does are exactly the same; the cards take the
// organisation's wording (`getAppointmentWording`).
//
// A card whose prestation has a description offers it through its « i »
// (ServiceDescriptionSheet), in both organisations; a tap still selects.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Service, ServiceType } from '@/domain/appointments';
import { groupServicesByCategory, type ServiceCategory } from '@/domain/services';
import type { CatalogueOrganization } from '@/features/services/catalogue-presentation';
import { AppText } from '@/shared/ui/AppText';
import { SearchField } from '@/shared/ui/SearchField';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import {
  foregroundSoft,
  interaction,
  serviceCategoryColors,
  spacing,
} from '@/shared/ui/theme';

import { filterCatalogServices } from '../filter-services';
import { filterServicesOfType, toServiceGridRows } from '../selection-sections';
import { ServiceDescriptionSheet } from './ServiceDescriptionSheet';
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
  /** One entry per selected occurrence: a Service selected twice appears twice. */
  readonly selectedServiceIds: readonly string[];
  readonly onSelectService: (service: Service) => void;
  /** Quantity mode: removes one occurrence of a selected Service ([−]). */
  readonly onDecrementService?: (service: Service) => void;
  /** [−] unavailable on every card (e.g. the last prestation of an Appointment). */
  readonly decrementDisabled?: boolean;
  /** Spoken on an already selected card: what a tap on it does here. */
  readonly selectedHint?: string;
  /** How the profession's catalogue is organised; the Services / Techniques segment by default. */
  readonly organization?: CatalogueOrganization;
  /** The professional's categories (unified organisation only). */
  readonly categories?: readonly ServiceCategory[];
}

export function ServiceCatalogPicker({
  services,
  selectedServiceIds,
  onSelectService,
  onDecrementService,
  decrementDisabled = false,
  selectedHint = 'Déjà dans le rendez-vous',
  organization = 'SERVICE_TYPES',
  categories = [],
}: ServiceCatalogPickerProps) {
  const [describedService, setDescribedService] = useState<Service>();
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const showDescription = (service: Service) => {
    setDescribedService(service);
    setDescriptionVisible(true);
  };
  const grid: GridOptions = {
    organization,
    onSelectService,
    onDecrementService,
    decrementDisabled,
    onShowDescription: showDescription,
    selectedHint,
    selectedServiceIds,
  };

  return (
    <>
      {organization === 'CATEGORIES' ? (
        <CategorizedServicePicker categories={categories} grid={grid} services={services} />
      ) : (
        <TypedServicePicker grid={grid} services={services} />
      )}
      <ServiceDescriptionSheet
        onClose={() => setDescriptionVisible(false)}
        onDismissed={() => setDescribedService(undefined)}
        service={describedService}
        visible={descriptionVisible}
      />
    </>
  );
}

/** What every card of the grid shares, whatever the organisation. */
interface GridOptions {
  readonly organization: CatalogueOrganization;
  readonly selectedServiceIds: readonly string[];
  readonly onSelectService: (service: Service) => void;
  readonly onDecrementService?: (service: Service) => void;
  readonly decrementDisabled: boolean;
  readonly onShowDescription: (service: Service) => void;
  readonly selectedHint: string;
}

function ServiceGrid({
  services,
  grid: {
    organization,
    selectedServiceIds,
    onSelectService,
    onDecrementService,
    decrementDisabled,
    onShowDescription,
    selectedHint,
  },
  testID,
}: {
  readonly services: readonly Service[];
  readonly grid: GridOptions;
  readonly testID: string;
}) {
  return (
    <View style={styles.grid} testID={testID}>
      {toServiceGridRows(services).map(([first, second]) => (
        <View key={first.id} style={styles.gridRow}>
          {[first, second].map((service, index) => {
            if (!service) return <View key={`spacer-${index}`} style={styles.gridSpacer} />;
            const quantity = selectedServiceIds.filter((id) => id === service.id).length;
            return (
              <ServiceSelectionCard
                key={service.id}
                accessibilityHint={quantity > 0 ? selectedHint : 'Ajouter au rendez-vous'}
                decrementDisabled={decrementDisabled}
                onDecrement={onDecrementService ? () => onDecrementService(service) : undefined}
                onPress={() => onSelectService(service)}
                onShowDescription={() => onShowDescription(service)}
                organization={organization}
                quantity={quantity}
                selected={quantity > 0}
                service={service}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function CategorizedServicePicker({
  services,
  categories,
  grid,
}: {
  readonly services: readonly Service[];
  readonly categories: readonly ServiceCategory[];
  readonly grid: GridOptions;
}) {
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const groups = useMemo(
    () => groupServicesByCategory(searching ? filterCatalogServices(services, query.trim()) : services, categories),
    [services, categories, query, searching],
  );

  return (
    <View style={styles.container} testID="service-catalog-picker">
      <SearchField
        accessibilityLabel="Rechercher une prestation"
        onChangeText={setQuery}
        placeholder="Rechercher une prestation"
        value={query}
      />
      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.category?.id ?? 'uncategorized'} style={styles.categoryGroup}>
            <SectionHeader count={group.items.length} title={group.category?.name ?? 'Sans catégorie'} />
            <ServiceGrid
              grid={grid}
              services={group.items}
              testID={`catalog-list-category-${group.category?.id ?? 'uncategorized'}`}
            />
          </View>
        ))
      ) : (
        <View style={styles.emptyState} testID="catalog-empty">
          <AppText variant="stateTitle">
            {searching ? 'Aucune prestation trouvée' : 'Aucune prestation disponible'}
          </AppText>
          <AppText variant="metadata" style={styles.emptyStateText}>
            {searching ? 'Essayez un autre nom.' : 'Activez une prestation depuis Prestations & tarifs.'}
          </AppText>
        </View>
      )}
    </View>
  );
}

function TypedServicePicker({
  services,
  grid,
}: {
  readonly services: readonly Service[];
  readonly grid: GridOptions;
}) {
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
        <ServiceGrid
          grid={grid}
          services={rows}
          testID={`catalog-list-${category}`}
        />
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
  categoryGroup: { gap: spacing.sm },
  grid: { gap: spacing.sm },
  // Two equal columns; a row takes the height of its taller card.
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  gridSpacer: { flex: 1 },
  emptyState: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyStateText: { color: foregroundSoft, textAlign: 'center' },
  switchAction: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  pressed: { opacity: interaction.pressedOpacity },
});
